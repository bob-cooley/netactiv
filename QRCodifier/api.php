<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

qrc_send_security_headers();
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    qrc_json(['error' => 'Method not allowed'], 405);
}

qrc_start_session();
if (!qrc_is_authenticated()) {
    qrc_json(['error' => 'Not signed in'], 401);
}
if (!qrc_check_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    qrc_json(['error' => 'Session token mismatch. Reload the page.'], 403);
}
session_write_close(); // release the session lock so checks can run in parallel

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}

$action = (string) ($input['action'] ?? '');

function qrc_find_index(array $items, string $id): int
{
    foreach ($items as $i => $item) {
        if (($item['id'] ?? '') === $id) {
            return $i;
        }
    }
    return -1;
}

function qrc_input_id(array $input): string
{
    $id = (string) ($input['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
        qrc_json(['error' => 'Invalid id'], 422);
    }
    return $id;
}

switch ($action) {
    case 'list':
        qrc_json(['items' => qrc_load_items()]);
        break;

    case 'check':
        $url = qrc_normalize_url((string) ($input['url'] ?? ''));
        if ($url === null) {
            qrc_json(['error' => 'Enter a valid http or https URL'], 422);
        }
        qrc_json(['url' => $url, 'check' => qrc_check_url($url)]);
        break;

    case 'save':
        $url = qrc_normalize_url((string) ($input['url'] ?? ''));
        if ($url === null) {
            qrc_json(['error' => 'Enter a valid http or https URL'], 422);
        }
        $check = qrc_check_url($url);
        if ($check['state'] === 'bad') {
            qrc_json(['error' => 'URL failed the live check: ' . $check['message'], 'url' => $url, 'check' => $check], 422);
        }
        $label = trim((string) ($input['label'] ?? ''));
        // UTF-8-safe truncation that works without mbstring.
        $label = preg_match('/^.{0,80}/us', $label, $m) ? $m[0] : '';

        $item = qrc_mutate(static function (array $items) use ($url, $label, $check): array {
            foreach ($items as $i => $existing) {
                if (($existing['url'] ?? '') === $url) {
                    $items[$i]['check'] = $check;
                    if ($label !== '') {
                        $items[$i]['label'] = $label;
                    }
                    return [$items, $items[$i]];
                }
            }
            $new = [
                'id' => bin2hex(random_bytes(6)),
                'url' => $url,
                'label' => $label,
                'created_at' => time(),
                'check' => $check,
            ];
            array_unshift($items, $new);
            return [$items, $new];
        });
        qrc_json(['item' => $item]);
        break;

    case 'recheck':
        $id = qrc_input_id($input);
        $items = qrc_load_items();
        $index = qrc_find_index($items, $id);
        if ($index < 0) {
            qrc_json(['error' => 'Not found'], 404);
        }
        $check = qrc_check_url((string) $items[$index]['url']);
        $item = qrc_mutate(static function (array $items) use ($id, $check): array {
            $i = qrc_find_index($items, $id);
            if ($i < 0) {
                return [$items, null];
            }
            $items[$i]['check'] = $check;
            return [$items, $items[$i]];
        });
        if ($item === null) {
            qrc_json(['error' => 'Not found'], 404);
        }
        qrc_json(['item' => $item]);
        break;

    case 'delete':
        $id = qrc_input_id($input);
        qrc_mutate(static function (array $items) use ($id): array {
            $i = qrc_find_index($items, $id);
            if ($i >= 0) {
                array_splice($items, $i, 1);
            }
            return [$items, null];
        });
        qrc_json(['ok' => true]);
        break;

    default:
        qrc_json(['error' => 'Unknown action'], 400);
}
