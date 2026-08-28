<?php
declare(strict_types=1);
require __DIR__ . DIRECTORY_SEPARATOR . 'lib.php';

menagerie_start_session();
$error = '';
$success = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = isset($_POST['action']) ? (string) $_POST['action'] : '';

    if ($action === 'login') {
        $adminHash = menagerie_admin_hash();
        if ($adminHash === '') {
            $error = 'Owner access has not been configured.';
        } elseif (menagerie_login_is_rate_limited()) {
            $error = 'Too many attempts. Try again later.';
        } else {
            $password = isset($_POST['password']) ? (string) $_POST['password'] : '';
            $candidate = hash('sha256', $password);
            if (hash_equals($adminHash, $candidate)) {
                session_regenerate_id(true);
                $_SESSION['authenticated'] = true;
                $_SESSION['csrf'] = bin2hex(random_bytes(24));
                menagerie_clear_login_failures();
                header('Location: upload.php');
                exit;
            }
            menagerie_record_login_failure();
            usleep(350000);
            $error = 'Access was not accepted.';
        }
    } elseif ($action === 'logout' && menagerie_is_authenticated()) {
        if (menagerie_check_csrf($_POST['csrf'] ?? null)) {
            $_SESSION = [];
            session_destroy();
            header('Location: upload.php');
            exit;
        }
    } elseif ($action === 'upload' && menagerie_is_authenticated()) {
        if (!menagerie_check_csrf($_POST['csrf'] ?? null)) {
            $error = 'The upload session expired. Reload the page and try again.';
        } elseif (!menagerie_ensure_data_dir()) {
            $error = 'Storage is not currently writable.';
        } else {
            $name = trim((string) ($_POST['pet_name'] ?? ''));
            $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
            $nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
            $file = $_FILES['sprite_sheet'] ?? null;

            if ($name === '' || $nameLength > 60) {
                $error = 'Enter a pet name between 1 and 60 characters.';
            } elseif (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                $error = 'Select a valid pet sprite sheet.';
            } elseif ((int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > MENAGERIE_MAX_UPLOAD_BYTES) {
                $error = 'The image could not be accepted.';
            } else {
                $temporaryFile = (string) $file['tmp_name'];
                $finfo = new finfo(FILEINFO_MIME_TYPE);
                $mime = (string) $finfo->file($temporaryFile);
                $allowed = ['image/png' => 'png', 'image/webp' => 'webp'];
                $image = @getimagesize($temporaryFile);
                $expected = menagerie_expected_dimensions();

                if (!isset($allowed[$mime]) || !is_array($image) || $expected === null) {
                    $error = 'The image could not be accepted.';
                } elseif ((int) $image[0] !== $expected[0] || (int) $image[1] !== $expected[1]) {
                    $error = 'The image does not match the required pet-sheet format.';
                } else {
                    $slug = menagerie_unique_slug($name);
                    $petDir = menagerie_data_dir() . DIRECTORY_SEPARATOR . 'pets' . DIRECTORY_SEPARATOR . $slug;
                    $extension = $allowed[$mime];
                    $destination = $petDir . DIRECTORY_SEPARATOR . 'spritesheet.' . $extension;

                    if (!mkdir($petDir, 0755, true) || !move_uploaded_file($temporaryFile, $destination)) {
                        $error = 'The image could not be stored.';
                    } else {
                        chmod($destination, 0644);
                        $pet = [
                            'slug' => $slug,
                            'name' => $name,
                            'sprite' => '/menagerie-data/pets/' . $slug . '/spritesheet.' . $extension,
                            'format' => $extension,
                            'spriteVersion' => 2,
                            'preview' => ['row' => 0, 'frames' => 6],
                            'added' => gmdate('Y-m-d'),
                        ];

                        $metadata = json_encode(
                            $pet,
                            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                        );
                        $metadataSaved = $metadata !== false
                            && file_put_contents($petDir . DIRECTORY_SEPARATOR . 'pet.json', $metadata . "\n", LOCK_EX) !== false;

                        if (!$metadataSaved || !menagerie_save_uploaded_pet($pet)) {
                            @unlink($destination);
                            @unlink($petDir . DIRECTORY_SEPARATOR . 'pet.json');
                            @rmdir($petDir);
                            $error = 'The catalog could not be updated.';
                        } else {
                            $success = $pet;
                        }
                    }
                }
            }
        }
    }
}

$authenticated = menagerie_is_authenticated();
$csrf = $authenticated ? menagerie_csrf_token() : '';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Upload Pet | The Menagerie</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="./" aria-label="The Menagerie home">
      <span class="eyebrow">ANIMATED COMPANIONS</span>
      <span class="brand-name">The Menagerie</span>
    </a>
    <a class="header-button" href="./">View Gallery</a>
  </header>

  <main class="upload-shell">
    <div class="upload-heading">
      <h1 class="upload-title"><?= $authenticated ? 'Add a pet' : 'Owner access' ?></h1>
      <p class="upload-intro">
        <?= $authenticated ? 'Name the pet and add its completed sprite sheet.' : 'This area is limited to the Menagerie owner.' ?>
      </p>
    </div>

    <section class="upload-panel">
      <?php if ($error !== ''): ?>
        <p class="message error" role="alert"><?= menagerie_escape($error) ?></p>
      <?php endif; ?>

      <?php if (is_array($success)): ?>
        <div class="message success" role="status">
          <strong><?= menagerie_escape((string) $success['name']) ?> was added.</strong><br>
          <a href="profile.php?pet=<?= rawurlencode((string) $success['slug']) ?>">Open the new profile</a>
        </div>
      <?php endif; ?>

      <?php if (!$authenticated): ?>
        <form method="post" autocomplete="off">
          <input type="hidden" name="action" value="login">
          <div class="field">
            <label for="password">Owner password</label>
            <input class="password-input" id="password" name="password" type="password" required autofocus>
          </div>
          <button class="primary-button" type="submit">Enter</button>
        </form>
      <?php else: ?>
        <form method="post" enctype="multipart/form-data" id="uploadForm">
          <input type="hidden" name="action" value="upload">
          <input type="hidden" name="csrf" value="<?= menagerie_escape($csrf) ?>">

          <div class="field">
            <label for="petName">Pet name</label>
            <input class="text-input" id="petName" name="pet_name" type="text" maxlength="60" required>
          </div>

          <div class="field">
            <label for="spriteSheet">Sprite sheet</label>
            <label class="drop-zone" id="dropZone" for="spriteSheet">
              <input id="spriteSheet" name="sprite_sheet" type="file" accept="image/png,image/webp" required>
              <span>
                <strong>Drop the completed sheet here</strong>
                or click to choose it in Finder
              </span>
            </label>
            <p class="selected-file" id="selectedFile" hidden></p>
          </div>

          <div class="form-actions">
            <button class="primary-button" type="submit">Add to Menagerie</button>
          </div>
          <p class="fine-print">Files are checked on the server before anything is added to the catalog.</p>
        </form>

        <form method="post" class="form-actions" style="margin-top: 22px">
          <input type="hidden" name="action" value="logout">
          <input type="hidden" name="csrf" value="<?= menagerie_escape($csrf) ?>">
          <button class="secondary-button" type="submit">Sign out</button>
        </form>
      <?php endif; ?>
    </section>
  </main>

  <?php if ($authenticated): ?>
    <script>
      const input = document.querySelector('#spriteSheet');
      const zone = document.querySelector('#dropZone');
      const selected = document.querySelector('#selectedFile');

      function showFile() {
        const file = input.files && input.files[0];
        selected.hidden = !file;
        selected.textContent = file ? file.name : '';
      }

      input.addEventListener('change', showFile);
      ['dragenter', 'dragover'].forEach((eventName) => {
        zone.addEventListener(eventName, (event) => {
          event.preventDefault();
          zone.classList.add('dragging');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        zone.addEventListener(eventName, (event) => {
          event.preventDefault();
          zone.classList.remove('dragging');
        });
      });
      zone.addEventListener('drop', (event) => {
        if (event.dataTransfer.files.length) {
          input.files = event.dataTransfer.files;
          showFile();
        }
      });
    </script>
  <?php endif; ?>
</body>
</html>
