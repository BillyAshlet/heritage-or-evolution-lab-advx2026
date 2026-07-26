import * as THREE from 'three';

const FISH_COUNT = 16;
const ALIGNMENT_RADIUS = 150;
const COHESION_RADIUS = 150;
const SEPARATION_RADIUS = 38;
const MIN_SPEED = 22;
const MAX_SPEED = 700;
const ALIGNMENT_STRENGTH = 0.42;
const COHESION_STRENGTH = 0.035;
const POINTER_COHESION_BASE = 27;
const POINTER_COHESION_PEAK = 534;
const MAX_ACCELERATION = 10000;
const BOUNDARY_MARGIN = 92;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function seededRandom(seed = 0x51f15e) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clampMagnitude(x, y, max) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= max || magnitude === 0) return [x, y];
  const scale = max / magnitude;
  return [x * scale, y * scale];
}

class TitleFishSchool {
  constructor(canvas, {
    count = FISH_COUNT,
    cohesionRadius = 720,
  } = {}) {
    this.canvas = canvas;
    this.count = count;
    this.cohesionRadius = cohesionRadius;
    this.positions = new Float32Array(count * 2);
    this.velocities = new Float32Array(count * 2);
    this.nextVelocities = new Float32Array(count * 2);
    this.scales = new Float32Array(count);
    this.phases = new Float32Array(count);
    this.pointer = { x: 0, y: 0, active: false, influence: 0 };
    this.width = 1;
    this.height = 1;
    this.elapsed = 0;
    this.lastFrame = performance.now();
    this.raf = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.sortObjects = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 20);
    this.camera.position.z = 10;

    const fishShape = new THREE.Shape();
    fishShape.moveTo(12, 0);
    fishShape.bezierCurveTo(8, -3.8, 1, -5, -7, -3.2);
    fishShape.lineTo(-11, -1.6);
    fishShape.lineTo(-17, -6);
    fishShape.lineTo(-15, 0);
    fishShape.lineTo(-17, 6);
    fishShape.lineTo(-11, 1.6);
    fishShape.lineTo(-7, 3.2);
    fishShape.bezierCurveTo(1, 5, 8, 3.8, 12, 0);
    const geometry = new THREE.ShapeGeometry(fishShape, 4);
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.68,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    const random = seededRandom();
    this.random = random;
    this._resize();
    this._seedFish();

    const palette = ['#ddd8cc', '#c9c1b2', '#b5aa9a', '#c4892a'];
    for (let index = 0; index < count; index += 1) {
      const paletteIndex = index % 7 === 0 ? 3 : Math.floor(random() * 3);
      this.mesh.setColorAt(index, new THREE.Color(palette[paletteIndex]));
    }
    this.mesh.instanceColor.needsUpdate = true;

    this.onResize = () => this._resize();
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.onResize);
    this.resizeObserver?.observe(canvas);

    this._frame = this._frame.bind(this);
    this.raf = requestAnimationFrame(this._frame);
  }

  _seedFish() {
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 2;
      this.positions[offset] = this.width * (0.16 + this.random() * 0.68);
      this.positions[offset + 1] = this.height * (0.25 + this.random() * 0.58);
      const heading = this.random() * Math.PI * 2;
      const speed = MIN_SPEED + this.random() * (MAX_SPEED - MIN_SPEED);
      this.velocities[offset] = Math.cos(heading) * speed;
      this.velocities[offset + 1] = Math.sin(heading) * speed;
      this.scales[index] = 0.78 + this.random() * 0.5;
      this.phases[index] = this.random() * Math.PI * 2;
    }
  }

  _resize() {
    const previousWidth = this.width;
    const previousHeight = this.height;
    const rect = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
    const nextHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.width = nextWidth;
    this.height = nextHeight;
    this.canvasRect = {
      left: rect.left,
      top: rect.top,
    };
    this.renderer.setSize(nextWidth, nextHeight, false);
    this.camera.left = 0;
    this.camera.right = nextWidth;
    this.camera.top = 0;
    this.camera.bottom = nextHeight;
    this.camera.updateProjectionMatrix();

    if (previousWidth > 1 && previousHeight > 1) {
      const scaleX = nextWidth / previousWidth;
      const scaleY = nextHeight / previousHeight;
      for (let index = 0; index < this.count; index += 1) {
        const offset = index * 2;
        this.positions[offset] *= scaleX;
        this.positions[offset + 1] *= scaleY;
      }
    }
  }

  setCohesionPointer(clientX, clientY, active = true) {
    this.pointer.x = clientX - this.canvasRect.left;
    this.pointer.y = clientY - this.canvasRect.top;
    this.pointer.active = active;
  }

  clearCohesionPointer() {
    this.pointer.active = false;
  }

  _step(dt) {
    this.elapsed += dt;
    const nextVelocities = this.nextVelocities;
    const pointerTarget = this.pointer.active ? 1 : 0;
    this.pointer.influence +=
      (pointerTarget - this.pointer.influence) * Math.min(1, dt * 8);

    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 2;
      const px = this.positions[offset];
      const py = this.positions[offset + 1];
      const vx = this.velocities[offset];
      const vy = this.velocities[offset + 1];
      let alignmentX = 0;
      let alignmentY = 0;
      let alignmentCount = 0;
      let cohesionX = 0;
      let cohesionY = 0;
      let cohesionCount = 0;
      let separationX = 0;
      let separationY = 0;

      for (let other = 0; other < this.count; other += 1) {
        if (other === index) continue;
        const otherOffset = other * 2;
        const dx = this.positions[otherOffset] - px;
        const dy = this.positions[otherOffset + 1] - py;
        const distance = Math.hypot(dx, dy);
        if (distance < ALIGNMENT_RADIUS) {
          alignmentX += this.velocities[otherOffset];
          alignmentY += this.velocities[otherOffset + 1];
          alignmentCount += 1;
        }
        if (distance < COHESION_RADIUS) {
          cohesionX += this.positions[otherOffset];
          cohesionY += this.positions[otherOffset + 1];
          cohesionCount += 1;
        }
        if (distance > 0 && distance < SEPARATION_RADIUS) {
          const strength = 1 - distance / SEPARATION_RADIUS;
          separationX -= (dx / distance) * strength;
          separationY -= (dy / distance) * strength;
        }
      }

      let ax = separationX * 92;
      let ay = separationY * 92;
      if (alignmentCount > 0) {
        ax +=
          (alignmentX / alignmentCount - vx) * ALIGNMENT_STRENGTH;
        ay +=
          (alignmentY / alignmentCount - vy) * ALIGNMENT_STRENGTH;
      }
      if (cohesionCount > 0) {
        ax +=
          (cohesionX / cohesionCount - px) * COHESION_STRENGTH;
        ay +=
          (cohesionY / cohesionCount - py) * COHESION_STRENGTH;
      }

      if (this.pointer.influence > 0.001) {
        const dx = this.pointer.x - px;
        const dy = this.pointer.y - py;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < this.cohesionRadius) {
          const normalizedDistance = distance / this.cohesionRadius;
          const field = 1 - normalizedDistance;
          const strength =
              (POINTER_COHESION_BASE + POINTER_COHESION_PEAK * field) *
              field *
              this.pointer.influence;
          ax += (dx / distance) * strength;
            ay += (dy / distance) * strength;
          }
      }

      const drift = this.elapsed * 0.42 + this.phases[index];
      ax += Math.cos(drift) * 3.2;
      ay += Math.sin(drift * 0.83) * 3.2;

      if (px < BOUNDARY_MARGIN) {
        ax += (1 - px / BOUNDARY_MARGIN) * 210;
      } else if (px > this.width - BOUNDARY_MARGIN) {
        ax -= (1 - (this.width - px) / BOUNDARY_MARGIN) * 210;
      }
      if (py < BOUNDARY_MARGIN) {
        ay += (1 - py / BOUNDARY_MARGIN) * 210;
      } else if (py > this.height - BOUNDARY_MARGIN) {
        ay -= (1 - (this.height - py) / BOUNDARY_MARGIN) * 210;
      }

      const acceleration = clampMagnitude(ax, ay, MAX_ACCELERATION);
      let nextX = vx + acceleration[0] * dt;
      let nextY = vy + acceleration[1] * dt;
      let speed = Math.hypot(nextX, nextY);
      if (speed < MIN_SPEED) {
        const scale = MIN_SPEED / Math.max(speed, 0.001);
        nextX *= scale;
        nextY *= scale;
        speed = MIN_SPEED;
      } else if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        nextX *= scale;
        nextY *= scale;
      }
      nextVelocities[offset] = nextX;
      nextVelocities[offset + 1] = nextY;
    }

    this.velocities.set(nextVelocities);
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 2;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += this.velocities[offset + 1] * dt;

      if (this.positions[offset] < 8) {
        this.positions[offset] = 8;
        this.velocities[offset] = Math.abs(this.velocities[offset]);
      } else if (this.positions[offset] > this.width - 8) {
        this.positions[offset] = this.width - 8;
        this.velocities[offset] = -Math.abs(this.velocities[offset]);
      }
      if (this.positions[offset + 1] < 8) {
        this.positions[offset + 1] = 8;
        this.velocities[offset + 1] = Math.abs(this.velocities[offset + 1]);
      } else if (this.positions[offset + 1] > this.height - 8) {
        this.positions[offset + 1] = this.height - 8;
        this.velocities[offset + 1] = -Math.abs(this.velocities[offset + 1]);
      }
    }
  }

  _render() {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 2;
      position.set(this.positions[offset], this.positions[offset + 1], 0);
      quaternion.setFromAxisAngle(
        Z_AXIS,
        Math.atan2(this.velocities[offset + 1], this.velocities[offset])
      );
      scale.setScalar(this.scales[index]);
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(index, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  _frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this._step(dt);
    this._render();
    this.raf = requestAnimationFrame(this._frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function mountTitleFish(canvas, options) {
  if (!canvas) return null;
  return new TitleFishSchool(canvas, options);
}
