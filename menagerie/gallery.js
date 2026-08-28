const gallery = document.querySelector("#petGallery");
const statusLine = document.querySelector("#galleryStatus");
const animations = [];

async function loadCatalog() {
  try {
    const response = await fetch("api/catalog.php", { cache: "no-store" });
    if (!response.ok) throw new Error("Catalog service unavailable");
    return await response.json();
  } catch (error) {
    const fallback = await fetch("catalog.json", { cache: "no-store" });
    if (!fallback.ok) throw error;
    return await fallback.json();
  }
}

function addPetCard(pet, index) {
  const link = document.createElement("a");
  link.className = "pet-card";
  link.href = `profile.php?pet=${encodeURIComponent(pet.slug)}`;
  link.setAttribute("aria-label", `View ${pet.name}`);

  const stage = document.createElement("div");
  stage.className = "pet-card-stage";

  const sprite = document.createElement("div");
  sprite.className = "pet-card-sprite";
  sprite.setAttribute("role", "img");
  sprite.setAttribute("aria-label", `${pet.name} animated preview`);
  sprite.style.backgroundImage = `url(${JSON.stringify(pet.sprite).slice(1, -1)})`;
  stage.append(sprite);

  const name = document.createElement("h2");
  name.textContent = pet.name;

  const label = document.createElement("span");
  label.className = "view-label";
  label.textContent = "View profile";

  link.append(stage, name, label);
  gallery.append(link);

  animations.push({
    element: sprite,
    frame: index % Math.max(1, pet.preview?.frames || 6),
    frames: pet.preview?.frames || 6,
    row: pet.preview?.row || 0,
    lastFrameAt: performance.now() + index * 70,
  });
}

function animate(now) {
  animations.forEach((animation) => {
    if (now - animation.lastFrameAt >= 170) {
      animation.frame = (animation.frame + 1) % animation.frames;
      animation.element.style.backgroundPosition =
        `${-animation.frame * 192}px ${-animation.row * 208}px`;
      animation.lastFrameAt = now;
    }
  });
  requestAnimationFrame(animate);
}

loadCatalog()
  .then((pets) => {
    statusLine.hidden = true;
    if (!Array.isArray(pets) || pets.length === 0) {
      statusLine.hidden = false;
      statusLine.textContent = "No pets have arrived yet.";
      return;
    }
    pets.forEach(addPetCard);
    requestAnimationFrame(animate);
  })
  .catch(() => {
    statusLine.textContent = "The catalog could not be loaded.";
  });
