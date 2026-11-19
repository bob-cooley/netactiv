<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

qrc_send_security_headers();
qrc_start_session();

$configured = qrc_is_configured();
$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    if (!qrc_check_csrf($_POST['csrf'] ?? null)) {
        $error = 'Session expired. Try again.';
    } elseif ($action === 'logout') {
        qrc_logout();
        header('Location: ./', true, 303);
        exit;
    } elseif ($action === 'login' && $configured) {
        if (qrc_login_is_rate_limited()) {
            $error = 'Too many attempts. Wait 15 minutes.';
        } elseif (!qrc_verify_turnstile((string) ($_POST['cf-turnstile-response'] ?? ''))) {
            $error = 'Captcha check failed. Try again.';
        } elseif (!password_verify((string) ($_POST['password'] ?? ''), qrc_config()['password_hash'])) {
            qrc_record_login_failure();
            usleep(400000);
            $error = 'Wrong password.';
        } else {
            qrc_clear_login_failures();
            session_regenerate_id(true);
            $_SESSION['auth'] = true;
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
            header('Location: ./', true, 303);
            exit;
        }
    }
}

$authed = qrc_is_authenticated();
$csrf = qrc_csrf_token();
$h = static function (string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
};
$asset = static function (string $file): string {
    $path = __DIR__ . '/' . $file;
    return $file . (is_file($path) ? '?v=' . filemtime($path) : '');
};
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="csrf-token" content="<?= $h($csrf) ?>">
  <title>QRCodifier</title>
  <link rel="preconnect" href="https://use.typekit.net">
  <link rel="stylesheet" href="https://use.typekit.net/huu3rip.css">
  <link rel="stylesheet" href="<?= $h($asset('styles.css')) ?>">
<?php if (!$authed && $configured): ?>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<?php endif; ?>
</head>
<body class="<?= $authed ? 'is-app' : 'is-login' ?>">

<?php if (!$authed): ?>
  <main class="login">
    <h1 class="wordmark">QR<span>Codifier</span></h1>
<?php if (!$configured): ?>
    <p class="notice">Not configured. Set the <code>QRCODIFIER_PASSWORD</code>, <code>TURNSTILE_SITE_KEY</code> and <code>TURNSTILE_SECRET_KEY</code> repository secrets, then redeploy.</p>
<?php else: ?>
    <form method="post" class="login-form" autocomplete="on">
      <input type="hidden" name="action" value="login">
      <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
      <input type="text" name="username" value="bob" autocomplete="username" hidden>
      <label for="password">Password</label>
      <div class="password-control">
        <input id="password" name="password" spellcheck="false" autocapitalize="off" type="password" autocomplete="current-password" required autofocus>
        <button class="password-visibility" id="togglePassword" type="button" aria-label="Show password" aria-pressed="false">
          <svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.25 12s3.5-6 9.75-6 9.75 6 9.75 6-3.5 6-9.75 6S2.25 12 2.25 12Z"></path>
            <circle cx="12" cy="12" r="2.75"></circle>
            <path class="eye-slash" d="M4 4 20 20"></path>
          </svg>
        </button>
      </div>
      <div class="cf-turnstile" data-sitekey="<?= $h(qrc_config()['turnstile_site']) ?>" data-theme="dark"></div>
      <button type="submit">Enter</button>
<?php if ($error !== ''): ?>
      <p class="error" role="alert"><?= $h($error) ?></p>
<?php endif; ?>
    </form>
    <script>
      (function () {
        var input = document.getElementById('password');
        var toggle = document.getElementById('togglePassword');
        toggle.addEventListener('click', function () {
          var showing = input.type === 'text';
          input.type = showing ? 'password' : 'text';
          toggle.classList.toggle('showing', !showing);
          toggle.setAttribute('aria-pressed', String(!showing));
          toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
          input.focus();
        });
      })();
    </script>
<?php endif; ?>
  </main>

<?php else: ?>
  <header class="top">
    <h1 class="wordmark">QR<span>Codifier</span></h1>
    <form method="post">
      <input type="hidden" name="action" value="logout">
      <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
      <button type="submit" class="ghost">Log out</button>
    </form>
  </header>

  <main class="app">
    <section class="workbench">
      <form id="create-form" class="create" autocomplete="off" novalidate>
        <label for="url">URL</label>
        <div class="url-row">
          <span id="url-dot" class="dot" data-state="idle" role="img" aria-label="Not checked"></span>
          <input id="url" type="text" inputmode="url" placeholder="https://example.com" spellcheck="false" autocapitalize="off" required>
        </div>
        <p id="url-msg" class="msg" aria-live="polite"></p>

        <label for="label">Label <span class="opt">optional</span></label>
        <input id="label" type="text" maxlength="80" placeholder="Shown in the library">

        <button id="generate" type="submit">Generate</button>
      </form>

      <div id="preview" class="preview" hidden>
        <div id="preview-qr" class="qr-frame"></div>
        <div class="preview-meta">
          <p id="preview-label" class="preview-label"></p>
          <p class="preview-url-row">
            <span id="preview-dot" class="dot" data-state="idle" role="img"></span>
            <a id="preview-url" href="#" target="_blank" rel="noopener noreferrer"></a>
          </p>
          <p id="preview-status" class="msg"></p>
          <div class="downloads">
            <button id="dl-png" type="button">Download PNG</button>
            <button id="dl-svg" type="button" class="ghost">Download SVG</button>
          </div>
          <p id="preview-spec" class="spec"></p>
        </div>
      </div>
    </section>

    <section class="gallery">
      <div class="gallery-head">
        <h2>Library <span id="count" class="count"></span></h2>
        <input id="search" type="search" placeholder="Filter" aria-label="Filter library">
      </div>
      <ul id="grid" class="grid"></ul>
      <p id="empty" class="empty" hidden>No codes yet.</p>
    </section>
  </main>

  <script src="<?= $h($asset('qrcode.js')) ?>"></script>
  <script src="<?= $h($asset('app.js')) ?>"></script>
<?php endif; ?>
</body>
</html>
