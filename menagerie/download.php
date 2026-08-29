<?php
declare(strict_types=1);
require __DIR__ . DIRECTORY_SEPARATOR . 'lib.php';

function download_error(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    exit($message);
}

$slug = isset($_GET['pet']) ? (string) $_GET['pet'] : '';
if (!preg_match('/^[a-z0-9-]{1,64}$/', $slug)) {
    download_error(400, 'Invalid pet.');
}

$pet = menagerie_find_pet($slug);
if ($pet === null) {
    download_error(404, 'Pet not found.');
}

$sprite = menagerie_resolve_pet_sprite($pet);
if ($sprite === null) {
    download_error(404, 'Sprite sheet not found.');
}

$size = filesize($sprite['path']);
if ($size === false) {
    download_error(404, 'Sprite sheet not found.');
}

$downloadName = menagerie_download_filename($pet, $sprite['extension']);
header('Content-Type: ' . $sprite['mime']);
header('Content-Disposition: attachment; filename="' . $downloadName . '"');
header('Content-Length: ' . $size);
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    readfile($sprite['path']);
}
exit;
