import {
  analyzeCascadeSeries,
  groupStatistics,
  radialAttribution,
} from './experiment-model.js';

function aliveIndices(simulation, schoolIndex) {
  const result = [];
  for (let index = 0; index < simulation.count; index += 1) {
    if (
      simulation.alive[index] &&
      simulation.schoolIds[index] === schoolIndex
    ) {
      result.push(index);
    }
  }
  return result;
}

export class CascadeProbe {
  constructor(simulation) {
    this.simulation = simulation;
    this.reset();
  }

  reset() {
    this.baselineSamples = [];
    this.eventSamples = [];
    this.released = false;
    this.control = false;
    this.releaseTime = null;
    this.nextSampleTime = 0;
    this.impulseByDirection = {
      largeToSmall: 0,
      mediumToSmall: 0,
    };
    this.forbidden = { pursuit: 0, directThreat: 0, captures: 0 };
    this.result = null;
    this.lockedBaseline = null;
  }

  schoolRoles() {
    const sorted = this.simulation.config.schools
      .map((school, index) => ({ index, size: school.size }))
      .sort((a, b) => a.size - b.size);
    return {
      small: sorted[0]?.index ?? 0,
      medium: sorted[Math.floor((sorted.length - 1) / 2)]?.index ?? 0,
      large: sorted.at(-1)?.index ?? 0,
    };
  }

  release(time) {
    this.released = true;
    this.releaseTime = time;
    this.control = false;
    this.eventSamples = [];
    this.result = null;
    this.nextSampleTime = time;
  }

  beginControl(time) {
    this.released = true;
    this.releaseTime = time;
    this.control = true;
    this.eventSamples = [];
    this.result = null;
    this.nextSampleTime = time;
  }

  addImpulse(sourceSchool, targetSchool, magnitude) {
    if (!this.released) return;
    const roles = this.schoolRoles();
    if (sourceSchool === roles.large && targetSchool === roles.small) {
      this.impulseByDirection.largeToSmall += magnitude;
    } else if (
      sourceSchool === roles.medium &&
      targetSchool === roles.small
    ) {
      this.impulseByDirection.mediumToSmall += magnitude;
    }
  }

  addForbidden(kind, sourceSchool, targetSchool, amount = 1) {
    const roles = this.schoolRoles();
    if (sourceSchool !== roles.large || targetSchool !== roles.small) return;
    this.forbidden[kind] = (this.forbidden[kind] ?? 0) + amount;
  }

  sample(time) {
    const config = this.simulation.config;
    if (config.runtime.mode !== 'cascade') return;
    if (
      !this.released &&
      time + 1e-9 < config.holding.settleSeconds
    ) {
      return;
    }
    if (time + 1e-9 < this.nextSampleTime) return;
    this.nextSampleTime = time + config.cascadeJudge.sampleInterval;
    const roles = this.schoolRoles();
    const smallIndices = aliveIndices(this.simulation, roles.small);
    const mediumIndices = aliveIndices(this.simulation, roles.medium);
    const largeIndices = aliveIndices(this.simulation, roles.large);
    const small = groupStatistics(
      this.simulation.positions,
      this.simulation.velocities,
      smallIndices
    );
    const medium = groupStatistics(
      this.simulation.positions,
      this.simulation.velocities,
      mediumIndices
    );
    const large = groupStatistics(
      this.simulation.positions,
      this.simulation.velocities,
      largeIndices
    );
    const attribution = radialAttribution({
      smallIndices,
      mediumSchoolIndex: roles.medium,
      positions: this.simulation.positions,
      velocities: this.simulation.velocities,
      alive: this.simulation.alive,
      schoolIds: this.simulation.schoolIds,
      radialSpeedThreshold: config.cascadeJudge.radialSpeedThreshold,
      maxNeighborDistance:
        config.perception.crossSeparationScale *
        Math.max(
          config.schools[roles.small].size,
          config.schools[roles.medium].size
        ),
    });
    const sample = {
      time: this.released ? time - this.releaseTime : time,
      rogSmall: small.rog,
      rogMedium: medium.rog,
      rogLarge: large.rog,
      neighborsSmall: this.simulation.averageNeighbors(roles.small),
      neighborsMedium: this.simulation.averageNeighbors(roles.medium),
      mediumAttribution: attribution.mediumRate,
      attributionSamples: attribution.samples,
      largeToSmallImpulse: this.impulseByDirection.largeToSmall,
      mediumToSmallImpulse: this.impulseByDirection.mediumToSmall,
    };
    if (this.released) {
      this.eventSamples.push(sample);
      if (sample.time >= config.holding.observationSeconds) {
        this.finalize();
      }
    } else {
      this.baselineSamples.push(sample);
      const cutoff = time - config.holding.baselineSeconds;
      this.baselineSamples = this.baselineSamples.filter(
        (item) => item.time >= cutoff
      );
      const status = this._rawBaselineStatus();
      if (status.ready && !this.lockedBaseline) {
        this.lockedBaseline = this.baselineSamples.map((item) => ({
          ...item,
        }));
      }
    }
  }

  _rawBaselineStatus() {
    const config = this.simulation.config;
    if (
      this.simulation.elapsed + 1e-9 <
        config.holding.settleSeconds + config.holding.baselineSeconds ||
      this.baselineSamples.length < 2
    ) {
      return { ready: false, reason: 'sampling' };
    }
    const roles = this.schoolRoles();
    const latest = this.baselineSamples.at(-1);
    const shortest = Math.min(
      config.tank.width,
      config.tank.height,
      config.tank.depth
    );
    const maxRog =
      shortest * config.cascadeJudge.maxBaselineRogShortestSideFactor;
    const shape =
      latest.rogSmall < maxRog && latest.rogMedium < maxRog;
    const neighbors =
      latest.neighborsSmall > config.cascadeJudge.minAverageNeighbors &&
      latest.neighborsMedium > config.cascadeJudge.minAverageNeighbors;
    return {
      ready: shape && neighbors,
      reason: !shape ? '群未成形' : !neighbors ? '邻居不足' : 'ready',
      roles,
      latest,
    };
  }

  baselineStatus() {
    if (this.lockedBaseline) {
      return {
        ready: true,
        reason: 'ready',
        locked: true,
        latest: this.lockedBaseline.at(-1),
      };
    }
    return this._rawBaselineStatus();
  }

  finalize() {
    if (this.result || !this.released) return this.result;
    this.result = analyzeCascadeSeries({
      baselineSamples: this.lockedBaseline ?? this.baselineSamples,
      eventSamples: this.eventSamples,
      impulseByDirection: this.impulseByDirection,
      forbidden: this.forbidden,
      config: this.simulation.config,
      tank: this.simulation.config.tank,
    });
    return this.result;
  }

  report() {
    return {
      released: this.released,
      control: Boolean(this.control),
      releaseTime: this.releaseTime,
      baselineReady: this.baselineStatus(),
      baselineSamples: this.lockedBaseline ?? this.baselineSamples,
      eventSamples: this.eventSamples,
      impulseByDirection: { ...this.impulseByDirection },
      forbidden: { ...this.forbidden },
      result: this.result,
    };
  }
}
