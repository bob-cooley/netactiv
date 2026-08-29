<?php
declare(strict_types=1);

const MENAGERIE_MAX_UPLOAD_BYTES = 20971520;

function menagerie_data_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'menagerie-data';
}

function menagerie_uploaded_catalog_path(): string
{
    return menagerie_data_dir() . DIRECTORY_SEPARATOR . 'catalog.json';
}

function menagerie_admin_hash(): string
{
    $environmentHash = getenv('MENAGERIE_ADMIN_HASH');
    if (is_string($environmentHash) && preg_match('/^[a-f0-9]{64}$/', $environmentHash)) {
        return $environmentHash;
    }

    $configPath = menagerie_data_dir() . DIRECTORY_SEPARATOR . 'admin-config.php';
    if (is_file($configPath)) {
        $configuredHash = require $configPath;
        if (is_string($configuredHash) && preg_match('/^[a-f0-9]{64}$/', $configuredHash)) {
            return $configuredHash;
        }
    }
    return '';
}

function menagerie_ensure_data_dir(): bool
{
    $dir = menagerie_data_dir();
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        return false;
    }

    $pets = $dir . DIRECTORY_SEPARATOR . 'pets';
    if (!is_dir($pets) && !mkdir($pets, 0755, true)) {
        return false;
    }

    $guard = $dir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!file_exists($guard)) {
        $rules = "Options -Indexes\n<FilesMatch \"\\.(json|php|phar|phtml)$\">\n  Require all denied\n</FilesMatch>\n";
        @file_put_contents($guard, $rules, LOCK_EX);
    }

    return is_writable($dir);
}

function menagerie_read_json_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

function menagerie_catalog(): array
{
    $base = menagerie_read_json_file(__DIR__ . DIRECTORY_SEPARATOR . 'catalog.json');
    $uploaded = menagerie_read_json_file(menagerie_uploaded_catalog_path());
    $merged = [];

    foreach (array_merge($base, $uploaded) as $pet) {
        if (is_array($pet) && isset($pet['slug'], $pet['name'], $pet['sprite'])) {
            $merged[(string) $pet['slug']] = $pet;
        }
    }

    return array_values($merged);
}

function menagerie_find_pet(string $slug): ?array
{
    foreach (menagerie_catalog() as $pet) {
        if (hash_equals((string) $pet['slug'], $slug)) {
            return $pet;
        }
    }
    return null;
}

function menagerie_path_is_within(string $path, string $directory): bool
{
    $root = realpath($directory);
    if ($root === false) {
        return false;
    }

    return $path === $root || str_starts_with($path, $root . DIRECTORY_SEPARATOR);
}

function menagerie_resolve_pet_sprite(array $pet): ?array
{
    $sprite = isset($pet['sprite']) ? (string) $pet['sprite'] : '';
    $path = explode('?', $sprite, 2)[0];

    if ($path === '' || str_contains($path, "\0") || str_contains($path, '\\')) {
        return null;
    }

    if (str_starts_with($path, '/menagerie-data/')) {
        $candidate = dirname(__DIR__) . $path;
        $approvedDirectory = menagerie_data_dir();
    } elseif (!str_starts_with($path, '/')) {
        $candidate = __DIR__ . DIRECTORY_SEPARATOR . $path;
        $approvedDirectory = __DIR__;
    } else {
        return null;
    }

    $resolved = realpath($candidate);
    if ($resolved === false || !is_file($resolved) || !is_readable($resolved)
        || !menagerie_path_is_within($resolved, $approvedDirectory)) {
        return null;
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($resolved);
    $formats = [
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    if (!isset($formats[$mime])) {
        return null;
    }

    return [
        'path' => $resolved,
        'mime' => $mime,
        'extension' => $formats[$mime],
    ];
}

function menagerie_download_filename(array $pet, string $extension): string
{
    $name = isset($pet['name']) ? (string) $pet['name'] : '';
    $safeName = preg_replace('/[^A-Za-z0-9_-]+/', '-', $name) ?? '';
    $safeName = trim($safeName, '-');
    if ($safeName === '') {
        $safeName = isset($pet['slug']) ? (string) $pet['slug'] : 'pet';
    }

    $version = isset($pet['spriteVersion']) ? (int) $pet['spriteVersion'] : 2;
    $suffix = $version > 0 ? '-v' . $version : '';
    return $safeName . $suffix . '.' . $extension;
}

function menagerie_slugify(string $name): string
{
    $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) : $name;
    $slug = strtolower((string) $ascii);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';
    $slug = trim($slug, '-');
    return $slug !== '' ? substr($slug, 0, 48) : 'pet';
}

function menagerie_unique_slug(string $name): string
{
    $base = menagerie_slugify($name);
    $used = array_column(menagerie_catalog(), 'slug');
    $candidate = $base;
    $suffix = 2;

    while (in_array($candidate, $used, true) || is_dir(menagerie_data_dir() . "/pets/{$candidate}")) {
        $candidate = substr($base, 0, 42) . '-' . $suffix;
        $suffix++;
    }
    return $candidate;
}

function menagerie_expected_dimensions(): ?array
{
    $reference = @getimagesize(__DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'neko.png');
    if (!is_array($reference) || !isset($reference[0], $reference[1])) {
        return null;
    }
    return [(int) $reference[0], (int) $reference[1]];
}

function menagerie_save_uploaded_pet(array $pet): bool
{
    if (!menagerie_ensure_data_dir()) {
        return false;
    }

    $lockPath = menagerie_data_dir() . DIRECTORY_SEPARATOR . 'catalog.lock';
    $lock = @fopen($lockPath, 'c+');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) fclose($lock);
        return false;
    }

    $catalog = menagerie_read_json_file(menagerie_uploaded_catalog_path());
    $catalog[] = $pet;
    $json = json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $temp = menagerie_uploaded_catalog_path() . '.tmp';
    $saved = $json !== false
        && file_put_contents($temp, $json . "\n", LOCK_EX) !== false
        && rename($temp, menagerie_uploaded_catalog_path());

    flock($lock, LOCK_UN);
    fclose($lock);
    return $saved;
}

function menagerie_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('menagerie_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/menagerie/',
        'secure' => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function menagerie_csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return (string) $_SESSION['csrf'];
}

function menagerie_check_csrf(?string $token): bool
{
    return isset($_SESSION['csrf']) && is_string($token) && hash_equals((string) $_SESSION['csrf'], $token);
}

function menagerie_is_authenticated(): bool
{
    return !empty($_SESSION['authenticated']);
}

function menagerie_login_rate_file(): string
{
    $address = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return menagerie_data_dir() . DIRECTORY_SEPARATOR . 'login-' . hash('sha256', $address) . '.json';
}

function menagerie_recent_login_failures(): array
{
    menagerie_ensure_data_dir();
    $now = time();
    return array_values(array_filter(
        menagerie_read_json_file(menagerie_login_rate_file()),
        static fn($timestamp): bool => is_int($timestamp) && $timestamp > $now - 900
    ));
}

function menagerie_login_is_rate_limited(): bool
{
    return count(menagerie_recent_login_failures()) >= 5;
}

function menagerie_record_login_failure(): void
{
    $failures = menagerie_recent_login_failures();
    $failures[] = time();
    @file_put_contents(
        menagerie_login_rate_file(),
        json_encode($failures),
        LOCK_EX
    );
}

function menagerie_clear_login_failures(): void
{
    @unlink(menagerie_login_rate_file());
}

function menagerie_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
