<?php
declare(strict_types=1);
require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
echo json_encode(
    menagerie_catalog(),
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);
