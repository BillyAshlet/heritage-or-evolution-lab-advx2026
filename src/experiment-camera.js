import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export const CAMERA_MODE = Object.freeze({
  GLOBAL: 'global',
  CLOSEUP: 'closeup',
  FOLLOW: 'follow',
});

export function cameraModeAfterEscape(mode) {
  return mode === CAMERA_MODE.GLOBAL ? CAMERA_MODE.GLOBAL : CAMERA_MODE.GLOBAL;
}

function dampAlpha(rate, dt) {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

export class ExperimentCameraController {
  constructor({ camera, renderer, presentation, simulation }) {
    this.camera = camera;
    this.renderer = renderer;
    this.presentation = presentation;
    this.simulation = simulation;
    this.selected = -1;
    this.mode = CAMERA_MODE.GLOBAL;
    this.dragPointer = null;
    this.dragStart = null;
    this.savedPose = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.previewCamera = new THREE.PerspectiveCamera(34, 1, 0.01, 10);
    this.marker = this._createMarker();
    this.inspector = this._createInspector();
    this.viewHud = this._createViewHud();
    this.app = document.getElementById('app');
    this.app.dataset.cameraMode = CAMERA_MODE.GLOBAL;
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

  _createInspector() {
    const inspector = document.createElement('aside');
    inspector.id = 'fish-inspector';
    inspector.hidden = true;
    inspector.setAttribute('aria-label', '鱼个体观察窗口');
    inspector.innerHTML = `
      <header>
        <span class="fish-inspector-index">SPECIMEN VIEW</span>
        <button type="button" id="fish-inspector-close" aria-label="关闭鱼观察窗口">×</button>
      </header>
      <div id="fish-preview-viewport" aria-label="鱼的第三人称实时特写">
        <span>LIVE · THIRD PERSON</span>
      </div>
      <div class="fish-inspector-copy">
        <strong id="fish-inspector-title">—</strong>
        <span id="fish-inspector-detail">—</span>
      </div>
      <div class="fish-inspector-actions" role="group" aria-label="鱼观察视角">
        <button type="button" id="fish-enter-closeup">特写视角 · 全屏</button>
        <button type="button" id="fish-enter-follow">跟随视角 · 全屏</button>
      </div>
    `;
    document.getElementById('app').appendChild(inspector);
    inspector
      .querySelector('#fish-inspector-close')
      .addEventListener('click', () => this.clearSelection());
    inspector
      .querySelector('#fish-enter-closeup')
      .addEventListener('click', () => this.enterCloseup());
    inspector
      .querySelector('#fish-enter-follow')
      .addEventListener('click', () => this.enterFollow());
    return inspector;
  }

  _createViewHud() {
    const hud = document.createElement('div');
    hud.id = 'fish-view-hud';
    hud.hidden = true;
    hud.innerHTML = `
      <span id="fish-view-mode">—</span>
      <strong id="fish-view-name">—</strong>
      <kbd>ESC 退出</kbd>
    `;
    document.getElementById('app').appendChild(hud);
    return hud;
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.mode !== CAMERA_MODE.GLOBAL) return;
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
      if (
        Math.hypot(
          event.clientX - this.dragStart.x,
          event.clientY - this.dragStart.y
        ) > 4
      ) {
        this.dragStart.moved = true;
      }
    });
    canvas.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.dragPointer) return;
      const wasMoved = this.dragStart?.moved;
      this.dragPointer = null;
      this.dragStart = null;
      canvas.releasePointerCapture?.(event.pointerId);
      if (!wasMoved && this.mode === CAMERA_MODE.GLOBAL) {
        this._handleClick(event);
      }
    });
    window.addEventListener('keydown', (event) => {
      // 演示卫生：一键收掉全部调试 UI。路演、截图、录屏都需要。
      // 注意：数字键 0/1/3/7 已被 scene.js 的 Blender 风格视角预设占用
      // （Digit1 = 正视图），所以这里用 H（hide）。
      if (event.key === 'h' || event.key === 'H') {
        const node = event.target;
        if (node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) {
          return;
        }
        event.preventDefault();
        const app = document.getElementById('app');
        app.dataset.uiHidden = app.dataset.uiHidden === '1' ? '' : '1';
        return;
      }
      if (event.key !== 'Escape') return;
      if (this.mode !== CAMERA_MODE.GLOBAL || this.selected >= 0) {
        event.preventDefault();
        this.exitView(true);
      }
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
    if (hit < 0) {
      this.clearSelection();
      return;
    }
    this.select(hit);
  }

  select(index) {
    const fish = this.simulation.fish(index);
    if (!fish?.alive) return false;
    this.selected = index;
    this.app.dataset.selectedFish = String(index);
    this.marker.visible = true;
    this.inspector.hidden = false;
    this.presentation.cameraSettings.orbitEnabled = true;
    this._refreshLabels(fish);
    return true;
  }

  clearSelection() {
    if (this.mode !== CAMERA_MODE.GLOBAL) this.exitView(false);
    this.selected = -1;
    delete this.app.dataset.selectedFish;
    this.marker.visible = false;
    this.inspector.hidden = true;
    this.viewHud.hidden = true;
    this.presentation.cameraSettings.orbitEnabled = true;
  }

  _refreshLabels(fish) {
    const relations =
      this.simulation.relationMatrix[fish.schoolIndex] ?? [];
    const hunts = relations.filter((value) => value === 'pursuit').length;
    const flees = relations.filter((value) => value === 'evade').length;
    const role =
      hunts && flees
        ? '捕食者 / 被捕食者'
        : hunts
          ? '捕食者'
          : flees
            ? '被捕食者'
            : '同级个体';
    const title = `${fish.school.name} #${fish.index}`;
    const detail =
      `${role} · panic ${fish.panic.toFixed(2)} · ` +
      `speed ${Math.hypot(...fish.velocity).toFixed(2)}`;
    this.inspector.querySelector('#fish-inspector-title').textContent = title;
    this.inspector.querySelector('#fish-inspector-detail').textContent = detail;
    this.viewHud.querySelector('#fish-view-name').textContent = title;
  }

  _enterMode(mode) {
    if (!this.select(this.selected) || mode === CAMERA_MODE.GLOBAL) return false;
    if (this.mode === CAMERA_MODE.GLOBAL) {
      this.savedPose = {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        near: this.camera.near,
        fov: this.camera.fov,
      };
    }
    this.mode = mode;
    this.app.dataset.cameraMode = mode;
    this.inspector.hidden = true;
    this.marker.visible = true;
    this.viewHud.hidden = false;
    this.viewHud.querySelector('#fish-view-mode').textContent =
      mode === CAMERA_MODE.CLOSEUP
        ? 'FULLSCREEN · CLOSE-UP'
        : 'FULLSCREEN · FOLLOW';
    this.presentation.cameraSettings.orbitEnabled = false;
    this.simulation.setHiddenFish(-1);
    return true;
  }

  enterCloseup(index = this.selected) {
    if (index !== this.selected && !this.select(index)) return false;
    return this._enterMode(CAMERA_MODE.CLOSEUP);
  }

  enterFollow(index = this.selected) {
    if (index !== this.selected && !this.select(index)) return false;
    return this._enterMode(CAMERA_MODE.FOLLOW);
  }

  exitView(clearSelection = false) {
    if (this.mode !== CAMERA_MODE.GLOBAL && this.savedPose) {
      this.camera.position.copy(this.savedPose.position);
      this.camera.quaternion.copy(this.savedPose.quaternion);
      this.camera.near = this.savedPose.near;
      this.camera.fov = this.savedPose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.mode = cameraModeAfterEscape(this.mode);
    this.app.dataset.cameraMode = CAMERA_MODE.GLOBAL;
    this.savedPose = null;
    this.viewHud.hidden = true;
    this.presentation.cameraSettings.orbitEnabled = true;
    this.simulation.setHiddenFish(-1);
    if (clearSelection) {
      this.clearSelection();
    } else if (this.selected >= 0) {
      this.marker.visible = true;
      this.inspector.hidden = false;
    }
    return true;
  }

  onSimulationRebuilt(simulation) {
    this.exitView(true);
    this.simulation = simulation;
  }

  _fallbackIfDead() {
    if (this.selected < 0 || this.simulation.alive[this.selected]) return;
    const fallback = this.simulation.nearestAliveSameSchool(this.selected);
    if (fallback >= 0) {
      this.selected = fallback;
      this.app.dataset.selectedFish = String(fallback);
    } else {
      this.exitView(true);
    }
  }

  _fishFrame(fish) {
    const position = new THREE.Vector3(...fish.position);
    const forward = new THREE.Vector3(...fish.velocity);
    if (forward.lengthSq() < 1e-9) forward.copy(FORWARD);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(UP, forward);
    if (right.lengthSq() < 1e-9) right.set(1, 0, 0);
    right.normalize();
    return { position, forward, right };
  }

  _closeupPose(fish) {
    const config = this.simulation.config.camera;
    const frame = this._fishFrame(fish);
    const framingScale = Math.max(0.2, fish.school.size);
    const cameraPosition = frame.position
      .clone()
      .addScaledVector(
        frame.forward,
        -config.closeupDistance * framingScale
      )
      .addScaledVector(frame.right, config.closeupSide * framingScale)
      .addScaledVector(UP, config.closeupHeight * framingScale);
    const lookTarget = frame.position
      .clone()
      .addScaledVector(frame.forward, config.lookAhead * 0.08);
    return { ...frame, cameraPosition, lookTarget };
  }

  _applyPose(targetCamera, pose, dt, fov) {
    const config = this.simulation.config.camera;
    targetCamera.position.lerp(
      pose.cameraPosition,
      dampAlpha(config.positionDamping, dt)
    );
    const matrix = new THREE.Matrix4().lookAt(
      targetCamera.position,
      pose.lookTarget,
      UP
    );
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      matrix
    );
    targetCamera.quaternion.slerp(
      targetQuaternion,
      dampAlpha(config.orientationDamping, dt)
    );
    targetCamera.fov = fov;
    targetCamera.near = config.globalNear;
    targetCamera.updateProjectionMatrix();
  }

  update(dt) {
    this._fallbackIfDead();
    const fish = this.simulation.fish(this.selected);
    if (!fish?.alive) return;
    this._refreshLabels(fish);
    const config = this.simulation.config.camera;
    const frame = this._fishFrame(fish);
    this.marker.position.copy(frame.position);
    this.marker.quaternion.setFromUnitVectors(FORWARD, frame.forward);

    const closeupPose = this._closeupPose(fish);
    this._applyPose(
      this.previewCamera,
      closeupPose,
      dt,
      config.closeupFov
    );

    if (this.mode === CAMERA_MODE.GLOBAL) {
      this.marker.visible = true;
      return;
    }
    this.marker.visible = true;
    if (this.mode === CAMERA_MODE.CLOSEUP) {
      this._applyPose(this.camera, closeupPose, dt, config.closeupFov);
      return;
    }

    const followPosition = frame.position
      .clone()
      .addScaledVector(
        frame.forward,
        -config.focusDistance * Math.max(0.2, fish.school.size)
      )
      .addScaledVector(
        UP,
        config.focusHeight * Math.max(0.2, fish.school.size)
      );
    const followTarget = frame.position
      .clone()
      .addScaledVector(frame.forward, config.lookAhead * 0.18);
    this._applyPose(
      this.camera,
      {
        cameraPosition: followPosition,
        lookTarget: followTarget,
      },
      dt,
      config.fov
    );
  }

  renderPreview() {
    if (
      this.mode !== CAMERA_MODE.GLOBAL ||
      this.inspector.hidden ||
      this.selected < 0
    ) {
      return;
    }
    const viewport = this.inspector.querySelector('#fish-preview-viewport');
    const targetRect = viewport.getBoundingClientRect();
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    if (
      targetRect.width <= 1 ||
      targetRect.height <= 1 ||
      canvasRect.width <= 1 ||
      canvasRect.height <= 1
    ) {
      return;
    }

    // WebGLRenderer.setViewport/setScissor accept logical pixels and apply
    // the renderer pixel ratio internally. Multiplying by DPR here would
    // double-scale the preview and make it spill over the main view.
    const x = targetRect.left - canvasRect.left;
    const y = canvasRect.bottom - targetRect.bottom;
    const width = targetRect.width;
    const height = targetRect.height;
    this.previewCamera.aspect = targetRect.width / targetRect.height;
    this.previewCamera.updateProjectionMatrix();

    const oldViewport = this.renderer.getViewport(new THREE.Vector4());
    const oldScissor = this.renderer.getScissor(new THREE.Vector4());
    const oldScissorTest = this.renderer.getScissorTest();
    const oldColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const oldAlpha = this.renderer.getClearAlpha();
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor('#dce9ef', 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.simulation.scene, this.previewCamera);
    this.renderer.setClearColor(oldColor, oldAlpha);
    this.renderer.setViewport(oldViewport);
    this.renderer.setScissor(oldScissor);
    this.renderer.setScissorTest(oldScissorTest);
  }
}
