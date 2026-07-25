import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { enabledObstacleSpecs } from './distance-field.js';

const UNIT_QUATERNION = { x: 0, y: 0, z: 0, w: 1 };

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
  object.removeFromParent();
}

function quaternionFromObstacle(obstacle) {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      obstacle.rotationX,
      obstacle.rotationY,
      obstacle.rotationZ,
      'XYZ'
    )
  );
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function transformedOffset(origin, rotation, offset) {
  const vector = new THREE.Vector3(...offset).applyQuaternion(
    new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
  );
  return {
    x: origin.x + vector.x,
    y: origin.y + vector.y,
    z: origin.z + vector.z,
  };
}

function staticRingPieces(obstacle) {
  const hole = obstacle.holeDiameter;
  const sideWidth = Math.max(0.001, (obstacle.width - hole) / 2);
  const capHeight = Math.max(0.001, (obstacle.height - hole) / 2);
  return [
    {
      size: [sideWidth, obstacle.height, obstacle.thickness],
      offset: [-(hole + sideWidth) / 2, 0, 0],
    },
    {
      size: [sideWidth, obstacle.height, obstacle.thickness],
      offset: [(hole + sideWidth) / 2, 0, 0],
    },
    {
      size: [hole, capHeight, obstacle.thickness],
      offset: [0, -(hole + capHeight) / 2, 0],
    },
    {
      size: [hole, capHeight, obstacle.thickness],
      offset: [0, (hole + capHeight) / 2, 0],
    },
  ];
}

export async function initializeRapier() {
  // 0.19.3's compat wrapper still feeds its embedded WASM bytes through the
  // legacy wasm-bindgen signature and emits a warning from inside the pinned
  // package. The public API is still init() with no arguments.
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (
      String(args[0]).startsWith(
        'using deprecated parameters for the initialization function'
      )
    ) {
      return;
    }
    originalWarn(...args);
  };
  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
  return RAPIER;
}

export class PhysicsEnvironment {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.staticVisuals = new THREE.Group();
    this.staticVisuals.name = 'experiment-static-obstacles';
    this.dynamicVisuals = new THREE.Group();
    this.dynamicVisuals.name = 'experiment-dynamic-bodies';
    scene.add(this.staticVisuals, this.dynamicVisuals);
    this.dynamic = [];
    this.rebuild(config);
  }

  rebuild(config) {
    this.config = config;
    for (const child of [...this.staticVisuals.children]) disposeObject(child);
    for (const child of [...this.dynamicVisuals.children]) disposeObject(child);
    this.dynamic.length = 0;
    this.world?.free?.();
    this.world = new RAPIER.World({
      x: config.physics.gravityX,
      y: config.physics.gravityY,
      z: config.physics.gravityZ,
    });
    this._buildTankColliders();
    this._buildStaticObstacles();
    if (config.physics.enabled && config.physics.spawnDefaults) {
      this.spawnRigidBody('ring');
      this.spawnRigidBody('cube');
      this.spawnRigidBody('column');
    }
  }

  dispose() {
    for (const group of [this.staticVisuals, this.dynamicVisuals]) {
      for (const child of [...group.children]) disposeObject(child);
      group.removeFromParent();
    }
    this.world?.free?.();
  }

  _buildTankColliders() {
    const { width, height, depth } = this.config.tank;
    const thickness = Math.max(0.04, this.config.tank.wallMargin);
    const half = [width / 2, height / 2, depth / 2];
    const walls = [
      [[thickness, height + thickness * 2, depth + thickness * 2], [-half[0] - thickness / 2, 0, 0]],
      [[thickness, height + thickness * 2, depth + thickness * 2], [half[0] + thickness / 2, 0, 0]],
      [[width, thickness, depth + thickness * 2], [0, -half[1] - thickness / 2, 0]],
      [[width, thickness, depth + thickness * 2], [0, half[1] + thickness / 2, 0]],
      [[width, height, thickness], [0, 0, -half[2] - thickness / 2]],
      [[width, height, thickness], [0, 0, half[2] + thickness / 2]],
    ];
    for (const [size, position] of walls) {
      const collider = RAPIER.ColliderDesc.cuboid(
        size[0] / 2,
        size[1] / 2,
        size[2] / 2
      ).setTranslation(...position);
      this.world.createCollider(collider);
    }
  }

  _material(color = '#91a9ba', opacity = 0.66) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.04,
      transparent: opacity < 1,
      opacity,
    });
  }

  _buildStaticObstacles() {
    for (const obstacle of enabledObstacleSpecs(this.config)) {
      const root = new THREE.Group();
      root.name = `obstacle-${obstacle.id}`;
      root.position.set(obstacle.x, obstacle.y, obstacle.z);
      root.rotation.set(
        obstacle.rotationX,
        obstacle.rotationY,
        obstacle.rotationZ
      );
      const rotation = quaternionFromObstacle(obstacle);
      const origin = { x: obstacle.x, y: obstacle.y, z: obstacle.z };
      if (obstacle.type === 'ring') {
        for (const piece of staticRingPieces(obstacle)) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(...piece.size),
            this._material('#8aa6b8', 0.72)
          );
          mesh.position.set(...piece.offset);
          root.add(mesh);
          const position = transformedOffset(origin, rotation, piece.offset);
          const collider = RAPIER.ColliderDesc.cuboid(
            piece.size[0] / 2,
            piece.size[1] / 2,
            piece.size[2] / 2
          )
            .setTranslation(position.x, position.y, position.z)
            .setRotation(rotation)
            .setRestitution(this.config.physics.restitution);
          this.world.createCollider(collider);
        }
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(
            obstacle.holeDiameter / 2 + obstacle.frameDepth / 2,
            obstacle.frameDepth / 2,
            6,
            32
          ),
          this._material('#66879d', 0.82)
        );
        root.add(lip);
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(
            obstacle.width,
            obstacle.height,
            obstacle.depth
          ),
          this._material('#9e9383', 0.76)
        );
        root.add(mesh);
        const collider = RAPIER.ColliderDesc.cuboid(
          obstacle.width / 2,
          obstacle.height / 2,
          obstacle.depth / 2
        )
          .setTranslation(obstacle.x, obstacle.y, obstacle.z)
          .setRotation(rotation)
          .setRestitution(this.config.physics.restitution);
        this.world.createCollider(collider);
      }
      this.staticVisuals.add(root);
    }
  }

  _createDynamicBody(position) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(this.config.physics.linearDamping)
        .setAngularDamping(this.config.physics.angularDamping)
        .setCanSleep(true)
    );
    return body;
  }

  _dynamicPosition(type, overrides = {}) {
    return {
      x:
        overrides.x ??
        this.config.physics[`${type}SpawnX`] ??
        this.config.physics.cubeSpawnX,
      y:
        overrides.y ??
        this.config.physics[`${type}SpawnY`] ??
        this.config.physics.cubeSpawnY,
      z:
        overrides.z ??
        this.config.physics[`${type}SpawnZ`] ??
        this.config.physics.cubeSpawnZ,
    };
  }

  _addDynamicCollider(body, descriptor, record) {
    descriptor
      .setDensity(this.config.physics.density)
      .setRestitution(this.config.physics.restitution);
    const collider = this.world.createCollider(descriptor, body);
    record.colliders.push(collider);
    return collider;
  }

  spawnRigidBody(type = 'cube', overrides = {}) {
    if (!this.config.physics.enabled) return null;
    const normalizedType = ['ring', 'cube', 'column'].includes(type)
      ? type
      : 'cube';
    const position = this._dynamicPosition(normalizedType, overrides);
    const body = this._createDynamicBody(position);
    const material = this._material('#d07d56', 0.92);
    const record = {
      type: normalizedType,
      body,
      colliders: [],
      mesh: null,
      boundingRadius: 0.2,
    };

    if (normalizedType === 'ring') {
      const radius = this.config.physics.dynamicRingRadius;
      const tube = this.config.physics.dynamicRingTube;
      const segments = 12;
      const root = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 32),
        material
      );
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        const halfLength = (Math.PI * radius) / segments;
        const descriptor = RAPIER.ColliderDesc.cuboid(
          halfLength,
          tube,
          tube
        )
          .setTranslation(radius * Math.cos(angle), radius * Math.sin(angle), 0)
          .setRotation({
            x: 0,
            y: 0,
            z: Math.sin((angle + Math.PI / 2) / 2),
            w: Math.cos((angle + Math.PI / 2) / 2),
          });
        this._addDynamicCollider(body, descriptor, record);
      }
      record.mesh = root;
      record.boundingRadius = radius + tube;
    } else if (normalizedType === 'column') {
      const columnRadius = this.config.physics.dynamicColumnRadius;
      const columnHeight = this.config.physics.dynamicColumnHeight;
      const baseRadius = this.config.physics.dynamicBaseRadius;
      const baseHeight = this.config.physics.dynamicBaseHeight;
      const root = new THREE.Group();
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(
          columnRadius,
          columnRadius,
          columnHeight,
          12
        ),
        material
      );
      column.position.y = baseHeight / 2;
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(baseRadius, baseRadius, baseHeight, 12),
        material.clone()
      );
      base.position.y = -columnHeight / 2;
      root.add(column, base);
      this._addDynamicCollider(
        body,
        RAPIER.ColliderDesc.cylinder(columnHeight / 2, columnRadius).setTranslation(
          0,
          baseHeight / 2,
          0
        ),
        record
      );
      this._addDynamicCollider(
        body,
        RAPIER.ColliderDesc.cylinder(baseHeight / 2, baseRadius).setTranslation(
          0,
          -columnHeight / 2,
          0
        ),
        record
      );
      record.mesh = root;
      record.boundingRadius = Math.max(
        baseRadius,
        (columnHeight + baseHeight) / 2
      );
    } else {
      const size = this.config.physics.dynamicCubeSize;
      record.mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        material
      );
      this._addDynamicCollider(
        body,
        RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2),
        record
      );
      record.boundingRadius = (Math.sqrt(3) * size) / 2;
    }
    record.mesh.position.set(position.x, position.y, position.z);
    record.mesh.userData.dynamicRigidBody = record;
    this.dynamicVisuals.add(record.mesh);
    this.dynamic.push(record);
    return record;
  }

  step(dt) {
    if (!this.config.physics.enabled) return;
    this.world.gravity = {
      x: this.config.physics.gravityX,
      y: this.config.physics.gravityY,
      z: this.config.physics.gravityZ,
    };
    this.world.integrationParameters.dt = dt;
    for (const record of this.dynamic) {
      record.body.setLinearDamping(this.config.physics.linearDamping);
      record.body.setAngularDamping(this.config.physics.angularDamping);
    }
    this.world.step();
    for (const record of this.dynamic) {
      const position = record.body.translation();
      const rotation = record.body.rotation();
      record.mesh.position.set(position.x, position.y, position.z);
      record.mesh.quaternion.set(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w
      );
    }
  }

  interactFish(point, velocity) {
    if (!this.config.physics.enabled) {
      return { force: [0, 0, 0], contacts: 0 };
    }
    const queryPoint = { x: point[0], y: point[1], z: point[2] };
    const interactionRadius = this.config.physics.interactionRadius;
    const padding = this.config.physics.aabbPadding;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let contacts = 0;
    for (const record of this.dynamic) {
      const center = record.body.translation();
      const broadRadius = record.boundingRadius + interactionRadius + padding;
      const dx = point[0] - center.x;
      const dy = point[1] - center.y;
      const dz = point[2] - center.z;
      if (
        Math.abs(dx) > broadRadius ||
        Math.abs(dy) > broadRadius ||
        Math.abs(dz) > broadRadius
      ) {
        continue;
      }
      let nearest = null;
      let nearestDistance = Infinity;
      for (const collider of record.colliders) {
        const projection = collider.projectPoint(queryPoint, false);
        if (!projection) continue;
        const px = point[0] - projection.point.x;
        const py = point[1] - projection.point.y;
        const pz = point[2] - projection.point.z;
        const distance = projection.isInside ? 0 : Math.hypot(px, py, pz);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = {
            x: projection.isInside ? dx : px,
            y: projection.isInside ? dy : py,
            z: projection.isInside ? dz : pz,
          };
        }
      }
      if (!nearest || nearestDistance > interactionRadius) continue;
      const magnitude = Math.hypot(nearest.x, nearest.y, nearest.z) || 1;
      const strength = 1 - nearestDistance / interactionRadius;
      const nx = nearest.x / magnitude;
      const ny = nearest.y / magnitude;
      const nz = nearest.z / magnitude;
      fx += nx * strength;
      fy += ny * strength;
      fz += nz * strength;
      contacts += 1;

      const relativeSpeed = Math.hypot(...velocity);
      const impulseMagnitude = Math.min(
        this.config.physics.fishImpulseLimit,
        this.config.physics.fishImpulseStrength *
          strength *
          (1 + relativeSpeed)
      );
      record.body.applyImpulseAtPoint(
        {
          x: -nx * impulseMagnitude,
          y: -ny * impulseMagnitude,
          z: -nz * impulseMagnitude,
        },
        queryPoint,
        true
      );
    }
    return { force: [fx, fy, fz], contacts };
  }

  rigidBodyClearance(point) {
    let clearance = Infinity;
    const queryPoint = { x: point[0], y: point[1], z: point[2] };
    for (const record of this.dynamic) {
      const center = record.body.translation();
      const broad = record.boundingRadius + this.config.physics.aabbPadding;
      if (
        Math.abs(point[0] - center.x) > broad ||
        Math.abs(point[1] - center.y) > broad ||
        Math.abs(point[2] - center.z) > broad
      ) {
        continue;
      }
      for (const collider of record.colliders) {
        const projection = collider.projectPoint(queryPoint, false);
        if (!projection) continue;
        if (projection.isInside) return -1;
        clearance = Math.min(
          clearance,
          Math.hypot(
            point[0] - projection.point.x,
            point[1] - projection.point.y,
            point[2] - projection.point.z
          )
        );
      }
    }
    return clearance;
  }

  metrics() {
    return this.dynamic.map((record) => {
      const position = record.body.translation();
      const rotation = record.body.rotation();
      return {
        type: record.type,
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        sleeping: record.body.isSleeping(),
      };
    });
  }
}

export { RAPIER, UNIT_QUATERNION };
