<?php
declare(strict_types=1);

// ---------------------------------------------------------------------
// Paths and configuration
// ---------------------------------------------------------------------

function qrc_data_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'qrcodifier-data';
}

function qrc_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = ['password_hash' => '', 'turnstile_site' => '', 'turnstile_secret' => ''];

    $path = qrc_data_dir() . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'config.php';
    if (is_file($path)) {
        $loaded = require $path;
        if (is_array($loaded)) {
            foreach ($config as $key => $_) {
                if (isset($loaded[$key]) && is_string($loaded[$key])) {
                    $config[$key] = $loaded[$key];
                }
            }
        }
    }

    $env = [
        'password_hash' => 'QRCODIFIER_PASSWORD_HASH',
        'turnstile_site' => 'TURNSTILE_SITE_KEY',
        'turnstile_secret' => 'TURNSTILE_SECRET_KEY',
    ];
    foreach ($env as $key => $name) {
        $value = getenv($name);
        if (is_string($value) && $value !== '') {
            $config[$key] = $value;
        }
    }

    return $config;
}

function qrc_is_configured(): bool
{
    $c = qrc_config();
    return $c['password_hash'] !== '' && $c['turnstile_site'] !== '' && $c['turnstile_secret'] !== '';
}

function qrc_ensure_data_dir(): bool
{
    $dir = qrc_data_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return false;
    }
    $guard = $dir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!file_exists($guard)) {
        @file_put_contents($guard, "Options -Indexes\nRequire all denied\n", LOCK_EX);
    }
    return is_writable($dir);
}

// ---------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------

function qrc_send_security_headers(): void
{
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
}

function qrc_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function qrc_client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

// ---------------------------------------------------------------------
// Session, CSRF, login
// ---------------------------------------------------------------------

const QRC_SESSION_LIFETIME = 604800; // 7 days

function qrc_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    // Own session store so shared-host garbage collection does not log out early.
    if (qrc_ensure_data_dir()) {
        $sessions = qrc_data_dir() . DIRECTORY_SEPARATOR . 'sessions';
        if (is_dir($sessions) || @mkdir($sessions, 0700, true)) {
            session_save_path($sessions);
            ini_set('session.gc_maxlifetime', (string) QRC_SESSION_LIFETIME);
        }
    }

    session_name('qrcodifier');
    session_set_cookie_params([
        'lifetime' => QRC_SESSION_LIFETIME,
        'path' => '/QRCodifier/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

function qrc_csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return (string) $_SESSION['csrf'];
}

function qrc_check_csrf($token): bool
{
    return isset($_SESSION['csrf']) && is_string($token) && hash_equals((string) $_SESSION['csrf'], $token);
}

function qrc_is_authenticated(): bool
{
    return !empty($_SESSION['auth']);
}

function qrc_logout(): void
{
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $params['path'],
        'secure' => $params['secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_destroy();
}

function qrc_login_rate_file(): string
{
    return qrc_data_dir() . DIRECTORY_SEPARATOR . 'login-' . hash('sha256', qrc_client_ip()) . '.json';
}

function qrc_recent_login_failures(): array
{
    $path = qrc_login_rate_file();
    if (!is_file($path)) {
        return [];
    }
    $data = json_decode((string) @file_get_contents($path), true);
    if (!is_array($data)) {
        return [];
    }
    $cutoff = time() - 900;
    return array_values(array_filter($data, static function ($t) use ($cutoff): bool {
        return is_int($t) && $t > $cutoff;
    }));
}

function qrc_login_is_rate_limited(): bool
{
    return count(qrc_recent_login_failures()) >= 5;
}

function qrc_record_login_failure(): void
{
    if (!qrc_ensure_data_dir()) {
        return;
    }
    $failures = qrc_recent_login_failures();
    $failures[] = time();
    @file_put_contents(qrc_login_rate_file(), json_encode($failures), LOCK_EX);
}

function qrc_clear_login_failures(): void
{
    $path = qrc_login_rate_file();
    if (is_file($path)) {
        @unlink($path);
    }
}

function qrc_verify_turnstile(string $token): bool
{
    if ($token === '' || strlen($token) > 2048) {
        return false;
    }
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'secret' => qrc_config()['turnstile_secret'],
            'response' => $token,
            'remoteip' => qrc_client_ip(),
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    $result = json_decode(is_string($body) ? $body : '', true);
    return is_array($result) && ($result['success'] ?? false) === true;
}

// ---------------------------------------------------------------------
// Gallery storage (single JSON file, locked read-modify-write)
// ---------------------------------------------------------------------

function qrc_items_path(): string
{
    return qrc_data_dir() . DIRECTORY_SEPARATOR . 'gallery.json';
}

function qrc_load_items(): array
{
    $path = qrc_items_path();
    if (!is_file($path)) {
        return [];
    }
    $fh = @fopen($path, 'rb');
    if (!$fh) {
        return [];
    }
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $items = json_decode((string) $raw, true);
    return is_array($items) ? array_values($items) : [];
}

/**
 * $fn receives the item list and returns [newItems, result].
 */
function qrc_mutate(callable $fn)
{
    if (!qrc_ensure_data_dir()) {
        qrc_json(['error' => 'Data folder is not writable on the server.'], 500);
    }
    $fh = @fopen(qrc_items_path(), 'c+b');
    if (!$fh) {
        qrc_json(['error' => 'Could not open gallery file.'], 500);
    }
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $items = json_decode((string) $raw, true);
    $items = is_array($items) ? array_values($items) : [];

    [$items, $result] = $fn($items);

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode(array_values($items), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

// ---------------------------------------------------------------------
// URL normalisation and live check
// ---------------------------------------------------------------------

function qrc_normalize_url(string $raw): ?string
{
    $url = trim($raw);
    if ($url === '' || strlen($url) > 2048 || preg_match('/\s/', $url)) {
        return null;
    }
    if (!preg_match('~^[a-z][a-z0-9+.\-]*://~i', $url)) {
        $url = 'https://' . $url;
    }
    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts['host'])) {
        return null;
    }
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    if ($scheme !== 'http' && $scheme !== 'https') {
        return null;
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }
    return $scheme . substr($url, strlen((string) $parts['scheme']));
}

function qrc_ip_is_public(string $ip): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return false;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $long = ip2long($ip);
        // 100.64.0.0/10 carrier-grade NAT
        if (($long & 0xFFC00000) === (ip2long('100.64.0.0') & 0xFFC00000)) {
            return false;
        }
    } else {
        $lower = strtolower($ip);
        // Unique local fc00::/7 and IPv4-mapped addresses
        if (preg_match('/^f[cd]/', $lower) || strpos($lower, '::ffff:') === 0) {
            return false;
        }
    }
    return true;
}

function qrc_resolve(string $host): array
{
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return [$host];
    }
    $ips = @gethostbynamel($host);
    if (is_array($ips) && $ips) {
        return $ips;
    }
    $records = @dns_get_record($host, DNS_AAAA);
    $v6 = [];
    if (is_array($records)) {
        foreach ($records as $r) {
            if (!empty($r['ipv6'])) {
                $v6[] = $r['ipv6'];
            }
        }
    }
    return $v6;
}

function qrc_http_probe(string $url, string $host, int $port, string $ip, bool $head): array
{
    $bytes = 0;
    $ch = curl_init($url);
    $opts = [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
        CURLOPT_WRITEFUNCTION => static function ($ch, string $data) use (&$bytes): int {
            $bytes += strlen($data);
            return $bytes > 65536 ? 0 : strlen($data); // stop after 64 KB; status is all we need
        },
    ];
    if ($head) {
        $opts[CURLOPT_NOBODY] = true;
    } else {
        $opts[CURLOPT_HTTPGET] = true;
    }
    if (!filter_var($host, FILTER_VALIDATE_IP)) {
        // Pin the connection to the address we already vetted (prevents DNS rebinding).
        $pinned = strpos($ip, ':') !== false ? '[' . $ip . ']' : $ip;
        $opts[CURLOPT_RESOLVE] = [$host . ':' . $port . ':' . $pinned];
    }
    if (defined('CURLOPT_PROTOCOLS')) {
        $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    }
    curl_setopt_array($ch, $opts);
    curl_exec($ch);
    $result = [
        'code' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'redirect' => (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL),
        'errno' => curl_errno($ch),
        'error' => curl_error($ch),
    ];
    curl_close($ch);
    return $result;
}

function qrc_reason(int $code): string
{
    $map = [
        200 => 'OK', 201 => 'Created', 202 => 'Accepted', 204 => 'No Content',
        400 => 'Bad Request', 401 => 'Unauthorized', 403 => 'Forbidden', 404 => 'Not Found',
        405 => 'Method Not Allowed', 406 => 'Not Acceptable', 408 => 'Timeout', 410 => 'Gone',
        429 => 'Too Many Requests', 451 => 'Unavailable For Legal Reasons',
        500 => 'Server Error', 502 => 'Bad Gateway', 503 => 'Service Unavailable', 504 => 'Gateway Timeout',
        521 => 'Web Server Down', 522 => 'Connection Timed Out', 523 => 'Origin Unreachable',
        525 => 'SSL Handshake Failed', 526 => 'Invalid SSL Certificate',
    ];
    return $map[$code] ?? '';
}

function qrc_check_result(string $state, int $code, string $message, string $finalUrl): array
{
    return [
        'state' => $state,        // ok | warn | bad
        'code' => $code,
        'message' => $message,
        'final_url' => $finalUrl,
        'checked_at' => time(),
    ];
}

function qrc_check_url(string $url): array
{
    $current = $url;

    for ($hop = 0; $hop <= 8; $hop++) {
        $parts = parse_url($current);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (!is_array($parts) || empty($parts['host']) || ($scheme !== 'http' && $scheme !== 'https')) {
            return qrc_check_result('bad', 0, 'Redirects to an unsupported address', $current);
        }
        $host = trim((string) $parts['host'], '[]');
        $port = isset($parts['port']) ? (int) $parts['port'] : ($scheme === 'https' ? 443 : 80);

        $ips = qrc_resolve($host);
        if (!$ips) {
            return qrc_check_result('bad', 0, 'Domain does not resolve (DNS lookup failed)', $current);
        }
        foreach ($ips as $ip) {
            if (!qrc_ip_is_public($ip)) {
                return qrc_check_result('bad', 0, 'Points to a private or local network address', $current);
            }
        }

        $probe = qrc_http_probe($current, $host, $port, $ips[0], true);
        if ($probe['code'] === 0 || $probe['code'] >= 400) {
            // Many servers mishandle HEAD; confirm with GET before judging.
            $get = qrc_http_probe($current, $host, $port, $ips[0], false);
            if ($get['code'] > 0 || $probe['code'] === 0) {
                $probe = $get;
            }
        }

        $code = $probe['code'];
        if ($code === 0) {
            $err = $probe['error'] !== '' ? $probe['error'] : 'No response';
            if (in_array($probe['errno'], [28], true)) {
                $err = 'Timed out';
            } elseif (in_array($probe['errno'], [35, 51, 58, 60], true)) {
                $err = 'TLS/certificate problem: ' . $probe['error'];
            } elseif (in_array($probe['errno'], [6, 7], true)) {
                $err = 'Could not connect';
            }
            return qrc_check_result('bad', 0, $err, $current);
        }

        if ($code >= 300 && $code < 400) {
            if ($probe['redirect'] === '') {
                return qrc_check_result('bad', $code, $code . ' redirect with no destination', $current);
            }
            $current = $probe['redirect'];
            continue;
        }

        $label = trim($code . ' ' . qrc_reason($code));
        $via = '';
        if ($current !== $url) {
            $finalHost = (string) parse_url($current, PHP_URL_HOST);
            $via = strcasecmp($finalHost, $host = (string) parse_url($url, PHP_URL_HOST)) === 0
                ? ' (after redirect)'
                : ' (via redirect to ' . $finalHost . ')';
        }

        if ($code >= 200 && $code < 300) {
            return qrc_check_result('ok', $code, $label . $via, $current);
        }
        if (in_array($code, [401, 403, 429, 999], true)) {
            return qrc_check_result('warn', $code, $label . $via . ' - site blocks automated checks; open it to confirm', $current);
        }
        return qrc_check_result('bad', $code, $label . $via, $current);
    }

    return qrc_check_result('bad', 0, 'Too many redirects', $current);
}
