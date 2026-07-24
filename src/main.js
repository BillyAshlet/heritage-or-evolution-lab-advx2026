import { World, TANK, notifyTankChange } from './world.js';
import { createScene } from './scene.js';
import { MotionInput, mountEnableButton } from './input.js';
import { Flock, BOID_PARAMS } from './boids.js';
import {
  CAPTURE_FX_PARAMS,
  ENERGY_PARAMS,
  PANIC_PARAMS,
  PREDATOR_PARAMS,
  SIM_PARAMS,
  TRAITS,
  TRAIT_MAPPING,
} from './evolution-model.js';
import { Predator } from './predator.js';
import { createDebug } from './debug.js';

const world = new World();
const input = new MotionInput(world);
// Presentation and physics share the same hold state (input owns both
// halves of the frame model), so they cannot disagree.
const presentation = createScene(
  document.getElementById('app'),
  () => input.presentationRotation()
);
const { renderer, scene, camera } = presentation;
mountEnableButton(input);
const flock = new Flock(world, scene);
const predator = new Predator(world, scene, flock);
flock.setPredator(predator);
const debug = createDebug({
  world,
  scene,
  input,
  presentation,
  flock,
  predator,
});

const reset = () => {
  flock.reset();
  predator.reset();
};
const recharge = () => flock.recharge();
const tire = () => flock.tireOne();
const startle = () => flock.startleOne();
const metrics = () => flock.metrics();

// Debug handle for console poking and automated verification — reads
// real state instead of scraping the panel UI. Not part of the game.
window.aquarium = {
  world,
  input,
  presentation,
  flock,
  predator,
  BOID_PARAMS,
  TRAITS,
  TRAIT_MAPPING,
  ENERGY_PARAMS,
  PANIC_PARAMS,
  PREDATOR_PARAMS,
  // Friendly aliases make console experiments read like the design model.
  traits: TRAITS,
  traitMapping: TRAIT_MAPPING,
  energyParams: ENERGY_PARAMS,
  panicParams: PANIC_PARAMS,
  predatorParams: PREDATOR_PARAMS,
  captureFxParams: CAPTURE_FX_PARAMS,
  simParams: SIM_PARAMS,
  get derived() {
    return flock.derived;
  },
  reset,
  recharge,
  tire,
  startle,
  metrics,
  TANK,
  notifyTankChange,
};

// The whole game, one frame at a time: senses → physics → picture → window.
renderer.setAnimationLoop((nowMs) => {
  input.update();
  presentation.updateOrientation();
  presentation.updateCamera(); // damped orbit controls tick (desktop)
  world.timeScale = SIM_PARAMS.timeScale;
  world.step(nowMs);
  renderer.render(scene, camera);
  debug.update(nowMs);
});
