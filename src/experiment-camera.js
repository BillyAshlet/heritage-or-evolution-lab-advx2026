import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);

export function resolveDoubleClickTarget(
  pickedHit,
  lastClickHit,
  elapsedMs,
  maxAgeMs = 500
) {
  if (pickedHit >= 0) return pickedHit;
  if (
    lastClickHit >= 0 &&
    elapsedMs >= 0 &&
    elapsedMs <= maxAgeMs
  ) {
    return lastClickHit;
  }
  return -1;
}

export class ExperimentCameraController {
  constructor({ camera, renderer, presentation, simulation }) {
    this.camera = camera;
    this.renderer = renderer;
    this.presentation = presentation;
    this.simulation = simulation;
    this.selected = -1;
    this.firstPerson = false;
    this.yaw = 0;
    this.pitch = 0;
    this.dragPointer = null;
    this.dragStart = null;
    this.lastClickHit = -1;
    this.lastClickAt = -Infinity;
    this.savedPose = null;
    this.selectionSavedPose = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.marker = this._createMarker();
    this.card = this._createCard();
    document.getElementById('app').dataset.cameraMode = 'global';
    this._bindEvents();
  }

  _createMarker() {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.002, 5, 20),
      new THREE.MeshBasicMaterial({
        color: '#233b4b',
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      })
    );
    marker.visible = false;
    marker.renderOrder = 10;
    this.simulation.scene.add(marker);
    return marker;
  }

  _createCard() {
    const card = document.createElement('div');
    card.id = 'fish-action-card';
    card.hidden = true;
    card.innerHTML = `
      <span class="action-eyebrow">SELECTED FISH</span>
      <strong id="fish-action-title">—</strong>
      <span id="fish-action-detail">—</span>
      <div class="fish-action-list" role="group" aria-label="选中鱼操作">
        <button type="button" id="fish-enter-first-person">进入第一人称</button>
        <button type="button" id="fish-keep-following">继续跟随观察</button>
        <button type="button" id="fish-return-global">返回全局视角</button>
      </div>
    `;
    document.getElementById('app').appendChild(card);
    card
      .querySelector('#fish-enter-first-person')
      .addEventListener('click', () => this.enterFirstPerson(this.selected));
    card
      .querySelector('#fish-keep-following')
      .addEventListener('click', () => {
        this.card.hidden = true;
      });
    card
      .querySelector('#fish-return-global')
      .addEventListener('click', () => this.clearSelection());
    return card;
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.dragPointer = event.pointerId;
      this.dragStart = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.dragPointer || !this.dragStart) return;
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      if (Math.hypot(dx, dy) > 4) this.dragStart.moved = true;
      if (this.firstPerson) {
        this.yaw -=
          event.movementX * this.simulation.config.camera.pointerSensitivity;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch -
            event.movementY *
              this.simulation.config.camera.pointerSensitivity,
          -Math.PI * 0.45,
          Math.PI * 0.45
        );
      }
      this.dragStart.x = event.clientX;
      this.dragStart.y = event.clientY;
    });
    canvas.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.dragPointer) return;
      const wasMoved = this.dragStart?.moved;
      this.dragPointer = null;
      this.dragStart = null;
      canvas.releasePointerCapture?.(event.pointerId);
      if (!wasMoved && !this.firstPerson) this._handleClick(event);
    });
    canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      const pickedHit = this._pick(event);
      const hit = resolveDoubleClickTarget(
        pickedHit,
        this.lastClickHit,
        performance.now() - this.lastClickAt
      );
      if (hit >= 0) this.enterFirstPerson(hit);
      else this.exitFirstPerson();
    });
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.exitFirstPerson();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.exitFirstPerson();
    });
  }

  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(
      this.simulation.mesh,
      false
    )[0];
    if (
      !hit ||
      hit.instanceId === undefined ||
      !this.simulation.alive[hit.instanceId]
    ) {
      return -1;
    }
    return hit.instanceId;
  }

  _handleClick(event) {
    const hit = this._pick(event);
    this.lastClickHit = hit;
    this.lastClickAt = performance.now();
    if (hit < 0) {
      this.clearSelection();
      return;
    }
    if (hit === this.selected) {
      this._showCard();
    } else {
      this.select(hit);
    }
  }

  select(index) {
    const fish = this.simulation.fish(index);
    if (!fish?.alive) return false;
    if (this.selected < 0 && !this.firstPerson) {
      this.selectionSavedPose = {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        near: this.camera.near,
      };
    }
    this.selected = index;
    document.getElementById('app').dataset.selectedFish = String(index);
    this.card.hidden = true;
    this.marker.visible = true;
    this.presentation.cameraSettings.orbitEnabled = false;
    return true;
  }

  clearSelection() {
    if (this.firstPerson) return;
    this.selected = -1;
    delete document.getElementById('app').dataset.selectedFish;
    this.marker.visible = false;
    this.card.hidden = true;
    if (this.selectionSavedPose) {
      this.camera.position.copy(this.selectionSavedPose.position);
      this.camera.quaternion.copy(this.selectionSavedPose.quaternion);
      this.camera.near = this.selectionSavedPose.near;
      this.camera.updateProjectionMatrix();
    }
    this.selectionSavedPose = null;
    this.presentation.cameraSettings.orbitEnabled = true;
  }

  _showCard() {
    const fish = this.simulation.fish(this.selected);
    if (!fish?.alive) return;
    const relations =
      this.simulation.relationMatrix[fish.schoolIndex] ?? [];
    const hunts = relations.filter((value) => value === 'pursuit').length;
    const flees = relations.filter((value) => value === 'evade').length;
    const role =
      hunts && flees
        ? '双重角色'
        : hunts
          ? '捕食者'
          : flees
            ? '被捕食者'
            : '同级个体';
    this.card.querySelector('#fish-action-title').textContent =
      `${fish.school.name} #${fish.index}`;
    this.card.querySelector('#fish-action-detail').textContent =
      `${role} · panic ${fish.panic.toFixed(2)} · speed ${Math.hypot(...fish.velocity).toFixed(2)}`;
    this.card.hidden = false;
  }

  enterFirstPerson(index = this.selected) {
    if (!this.select(index)) return false;
    if (!this.firstPerson) {
      this.savedPose = {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        near: this.camera.near,
      };
    }
    this.firstPerson = true;
    document.getElementById('app').dataset.cameraMode = 'first-person';
    this.yaw = 0;
    this.pitch = 0;
    this.card.hidden = true;
    this.marker.visible = false;
    this.presentation.cameraSettings.orbitEnabled = false;
    this.camera.near = this.simulation.config.camera.firstPersonNear;
    this.camera.updateProjectionMatrix();
    this.simulation.setHiddenFish(index);
    return true;
  }

  exitFirstPerson() {
    if (!this.firstPerson) return false;
    this.firstPerson = false;
    document.getElementById('app').dataset.cameraMode = 'global';
    this.simulation.setHiddenFish(-1);
    if (this.savedPose) {
      this.camera.position.copy(this.savedPose.position);
      this.camera.quaternion.copy(this.savedPose.quaternion);
      this.camera.near = this.savedPose.near;
      this.camera.updateProjectionMatrix();
    }
    this.savedPose = null;
    this.marker.visible = this.selected >= 0;
    this.presentation.cameraSettings.orbitEnabled = true;
    return true;
  }

  onSimulationRebuilt(simulation) {
    this.exitFirstPerson();
    this.simulation = simulation;
    this.clearSelection();
  }

  _fallbackIfDead() {
    if (this.selected < 0 || this.simulation.alive[this.selected]) return;
    const fallback = this.simulation.nearestAliveSameSchool(this.selected);
    if (fallback >= 0) {
      const wasFirstPerson = this.firstPerson;
      this.simulation.setHiddenFish(-1);
      this.selected = fallback;
      document.getElementById('app').dataset.selectedFish =
        String(fallback);
      if (wasFirstPerson) this.simulation.setHiddenFish(fallback);
    } else {
      this.exitFirstPerson();
      this.clearSelection();
    }
  }

  update(dt) {
    this._fallbackIfDead();
    const cameraConfig = this.simulation.config.camera;
    this.presentation.cameraSettings.fov = cameraConfig.fov;
    if (!this.firstPerson && this.camera.near !== cameraConfig.globalNear) {
      this.camera.near = cameraConfig.globalNear;
      this.camera.updateProjectionMatrix();
    }
    const fish = this.simulation.fish(this.selected);
    if (!fish?.alive) return;
    const position = new THREE.Vector3(...fish.position);
    const velocity = new THREE.Vector3(...fish.velocity);
    if (velocity.lengthSq() < 1e-9) velocity.copy(FORWARD);
    velocity.normalize();

    if (!this.firstPerson) {
      this.marker.visible = true;
      this.marker.position.copy(position);
      this.marker.quaternion.setFromUnitVectors(FORWARD, velocity);
      const desiredPosition = position
        .clone()
        .addScaledVector(velocity, -cameraConfig.focusDistance)
        .addScaledVector(this.camera.up, cameraConfig.focusHeight);
      this.camera.position.lerp(
        desiredPosition,
        1 - Math.exp(-cameraConfig.positionDamping * dt)
      );
      const lookTarget = position
        .clone()
        .addScaledVector(velocity, cameraConfig.lookAhead * 0.18);
      const targetMatrix = new THREE.Matrix4().lookAt(
        this.camera.position,
        lookTarget,
        this.camera.up
      );
      const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
        targetMatrix
      );
      this.camera.quaternion.slerp(
        targetQuaternion,
        1 - Math.exp(-cameraConfig.orientationDamping * dt)
      );
      return;
    }

    const config = this.simulation.config.camera;
    const desiredPosition = position
      .clone()
      .addScaledVector(velocity, config.headOffset);
    this.camera.position.lerp(
      desiredPosition,
      1 - Math.exp(-config.positionDamping * dt)
    );
    const base = new THREE.Quaternion().setFromUnitVectors(FORWARD, velocity);
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw
    );
    const pitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      this.pitch
    );
    const desiredRotation = base.multiply(yaw).multiply(pitch);
    this.camera.quaternion.slerp(
      desiredRotation,
      1 - Math.exp(-config.orientationDamping * dt)
    );
    this.camera.near = config.firstPersonNear;
    this.camera.fov = config.fov;
    this.camera.updateProjectionMatrix();
  }
}
