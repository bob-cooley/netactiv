<?php
declare(strict_types=1);
require __DIR__ . DIRECTORY_SEPARATOR . 'lib.php';

$slug = isset($_GET['pet']) ? (string) $_GET['pet'] : 'neko';
if (!preg_match('/^[a-z0-9-]{1,64}$/', $slug)) {
    $slug = '';
}
$pet = $slug !== '' ? menagerie_find_pet($slug) : null;
$found = $pet !== null;

if ($pet === null) {
    http_response_code(404);
    $pet = [
        'name' => 'Pet not found',
        'slug' => 'missing',
        'sprite' => '',
    ];
}

$petJson = json_encode(
    $pet,
    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES
);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= menagerie_escape((string) $pet['name']) ?> | The Menagerie</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="./" aria-label="The Menagerie home">
      <span class="eyebrow">ANIMATED COMPANIONS</span>
      <span class="brand-name">The Menagerie</span>
    </a>
    <a class="header-button" href="upload.php">Upload Pet</a>
  </header>

  <main class="profile-shell">
    <div class="profile-heading">
      <a class="back-link" href="./">← All pets</a>
      <h1 class="profile-title"><?= menagerie_escape((string) $pet['name']) ?></h1>
      <p class="profile-subtitle">Native 192 × 208 rendering. No scaling.</p>
    </div>

    <?php if (!$found): ?>
      <p class="message error">This pet could not be found.</p>
    <?php else: ?>
      <section class="stage-panel" aria-label="Animated pet preview">
        <div class="stage">
          <div id="pet" class="pet" role="img" aria-label="<?= menagerie_escape((string) $pet['name']) ?> animation"></div>
        </div>
        <div class="status-line">
          <span id="stateName">idle</span>
          <span id="frameCount">Frame 1 of 6</span>
        </div>
      </section>

      <section class="controls" aria-label="Animation controls">
        <div id="stateButtons" class="state-buttons"></div>
        <div class="playback-row">
          <button id="playPause" class="primary-button" type="button">Pause</button>
          <label>
            Speed
            <input id="speed" type="range" min="70" max="360" step="10" value="150">
          </label>
          <label>
            <input id="autoTour" type="checkbox">
            Tour all states
          </label>
        </div>
        <div class="download-row">
          <a class="secondary-button" href="download.php?pet=<?= rawurlencode((string) $pet['slug']) ?>">Download Sprite Sheet</a>
        </div>
      </section>
    <?php endif; ?>
  </main>

  <?php if ($found): ?>
    <script>window.MENAGERIE_PET = <?= $petJson ?>;</script>
    <script src="profile.js"></script>
  <?php endif; ?>
</body>
</html>
