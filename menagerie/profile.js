const states = [
  { name: "idle", row: 0, frames: 6 },
  { name: "running-right", row: 1, frames: 8 },
  { name: "running-left", row: 2, frames: 8 },
  { name: "waving", row: 3, frames: 4 },
  { name: "jumping", row: 4, frames: 5 },
  { name: "failed", row: 5, frames: 8 },
  { name: "waiting", row: 6, frames: 6 },
  { name: "running", row: 7, frames: 6 },
  { name: "review", row: 8, frames: 6 },
  { name: "look directions, first half", row: 9, frames: 8 },
  { name: "look directions, second half", row: 10, frames: 8 },
];

const pet = document.querySelector("#pet");
const stateName = document.querySelector("#stateName");
const frameCount = document.querySelector("#frameCount");
const buttonArea = document.querySelector("#stateButtons");
const playPause = document.querySelector("#playPause");
const speed = document.querySelector("#speed");
const autoTour = document.querySelector("#autoTour");

pet.style.backgroundImage = `url(${JSON.stringify(window.MENAGERIE_PET.sprite).slice(1, -1)})`;

let stateIndex = 0;
let frameIndex = 0;
let playing = true;
let lastFrameAt = performance.now();
let framesInState = 0;

states.forEach((state, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "state-button";
  button.textContent = state.name;
  button.addEventListener("click", () => selectState(index));
  buttonArea.append(button);
});

function selectState(index) {
  stateIndex = index;
  frameIndex = 0;
  framesInState = 0;
  document.querySelectorAll(".state-button").forEach((button, i) => {
    button.classList.toggle("active", i === stateIndex);
  });
  render();
}

function render() {
  const state = states[stateIndex];
  pet.style.backgroundPosition = `${-frameIndex * 192}px ${-state.row * 208}px`;
  stateName.textContent = state.name;
  frameCount.textContent = `Frame ${frameIndex + 1} of ${state.frames}`;
}

function animate(now) {
  if (playing && now - lastFrameAt >= Number(speed.value)) {
    const state = states[stateIndex];
    frameIndex = (frameIndex + 1) % state.frames;
    framesInState += 1;
    if (autoTour.checked && framesInState >= state.frames * 3) {
      selectState((stateIndex + 1) % states.length);
    } else {
      render();
    }
    lastFrameAt = now;
  }
  requestAnimationFrame(animate);
}

playPause.addEventListener("click", () => {
  playing = !playing;
  playPause.textContent = playing ? "Pause" : "Play";
});

selectState(0);
requestAnimationFrame(animate);
