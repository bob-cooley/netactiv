<?php
declare(strict_types=1);
require __DIR__ . DIRECTORY_SEPARATOR . 'lib.php';

menagerie_start_session();
if (!menagerie_is_authenticated()) {
    header('Location: upload.php', true, 303);
    exit;
}

$requestedSlug = isset($_GET['pet']) ? (string) $_GET['pet'] : '';
if (!menagerie_is_valid_slug($requestedSlug)) {
    http_response_code(404);
    exit('Pet not found.');
}

$slug = menagerie_resolve_slug($requestedSlug);
if ($slug !== $requestedSlug) {
    header('Location: edit.php?pet=' . rawurlencode($slug), true, 301);
    exit;
}

$pet = menagerie_find_pet($slug);
if ($pet === null) {
    http_response_code(404);
    exit('Pet not found.');
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!menagerie_check_csrf($_POST['csrf'] ?? null)) {
        $error = 'The edit session expired. Reload the page and try again.';
    } else {
        $name = trim((string) ($_POST['pet_name'] ?? ''));
        $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
        $nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
        $newSlug = menagerie_slugify((string) ($_POST['pet_slug'] ?? ''));
        $file = $_FILES['sprite_sheet'] ?? null;
        $replacingSprite = is_array($file) && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        if ($name === '' || $nameLength > 60) {
            $error = 'Enter a pet name between 1 and 60 characters.';
        } elseif (!menagerie_slug_is_available($newSlug, $slug)) {
            $error = 'That profile URL is already in use.';
        } elseif ($replacingSprite && (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
            || (int) ($file['size'] ?? 0) < 1 || (int) ($file['size'] ?? 0) > MENAGERIE_MAX_UPLOAD_BYTES)) {
            $error = 'Select a valid replacement sprite sheet.';
        } else {
            $temporaryFile = $replacingSprite ? (string) $file['tmp_name'] : '';
            $image = $replacingSprite ? @getimagesize($temporaryFile) : null;
            $mime = $replacingSprite ? (new finfo(FILEINFO_MIME_TYPE))->file($temporaryFile) : '';
            $expected = menagerie_expected_dimensions();
            $allowed = ['image/png', 'image/webp'];

            if ($replacingSprite && (!in_array($mime, $allowed, true) || !is_array($image) || $expected === null
                || (int) $image[0] !== $expected[0] || (int) $image[1] !== $expected[1])) {
                $error = 'The replacement does not match the required pet-sheet format.';
            } elseif ($replacingSprite && !menagerie_replace_pet_sprite($pet, $temporaryFile)) {
                $error = 'The replacement sprite sheet could not be stored.';
            } else {
                $updated = menagerie_update_pet($pet, $name, $newSlug);
                if ($updated === null) {
                $error = 'The Pet could not be updated. Try again.';
                } else {
                    header('Location: profile.php?pet=' . rawurlencode((string) $updated['slug']), true, 303);
                    exit;
                }
            }
        }
    }
}

$csrf = menagerie_csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Edit <?= menagerie_escape((string) $pet['name']) ?> | The Menagerie</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <link rel="stylesheet" href="styles.css?v=3">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="./" aria-label="The Menagerie home">
      <span class="eyebrow">ANIMATED COMPANIONS</span>
      <span class="brand-name">The Menagerie</span>
    </a>
    <a class="header-button" href="profile.php?pet=<?= rawurlencode((string) $pet['slug']) ?>">Back to Profile</a>
  </header>

  <main class="upload-shell">
    <div class="upload-heading">
      <h1 class="upload-title">Edit <?= menagerie_escape((string) $pet['name']) ?></h1>
      <p class="upload-intro">Changing the profile URL keeps the current sprite sheet in place. Old profile links will redirect.</p>
    </div>

    <section class="upload-panel">
      <?php if ($error !== ''): ?>
        <p class="message error" role="alert"><?= menagerie_escape($error) ?></p>
      <?php endif; ?>

      <form method="post" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="<?= menagerie_escape($csrf) ?>">
        <div class="field">
          <label for="petName">Pet name</label>
          <input class="text-input" id="petName" name="pet_name" type="text" maxlength="60" value="<?= menagerie_escape((string) $pet['name']) ?>" required>
        </div>
        <div class="field">
          <label for="spriteSheet">Replace sprite sheet</label>
          <input id="spriteSheet" name="sprite_sheet" type="file" accept="image/png,image/webp">
          <p class="fine-print">Optional. A replacement keeps this Pet's name, profile URL, and catalog entry.</p>
        </div>
        <div class="field">
          <label for="petSlug">Profile URL</label>
          <input class="text-input" id="petSlug" name="pet_slug" type="text" maxlength="48" value="<?= menagerie_escape((string) $pet['slug']) ?>" required>
          <p class="fine-print">Use letters, numbers, and hyphens. The old profile and download links will redirect when this changes.</p>
        </div>
        <div class="form-actions">
          <button class="primary-button" type="submit">Save Pet</button>
          <a class="secondary-button" href="profile.php?pet=<?= rawurlencode((string) $pet['slug']) ?>">Cancel</a>
        </div>
      </form>
    </section>
  </main>
</body>
</html>
