import * as THREE from 'three';
import { playgroundHeight } from './playground.ts';

export type PropImpact = Readonly<{ id: string; x: number; y: number; z: number; vx: number; vz: number; speed: number }>;
type PropKind = 'rail' | 'table' | 'chair';
type PropBody = {
  object: THREE.Object3D; home: THREE.Vector3; homeRotation: THREE.Quaternion;
  corners: THREE.Vector3[]; kind: PropKind; changed: () => void;
  velocity: THREE.Vector3; tumble: THREE.Quaternion; hit: boolean; awake: boolean;
  age: number; maxTravel: number;
};

const clamp = THREE.MathUtils.clamp;
function variation(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967295;
}

/** Lightweight one-shot prop reactions. Sleeping pieces remain scattered until reset.
 * The driving simulation owns hit detection and stops treating hit props as solids.
 * Render objects stay in semantic city coordinates below the reflected city root.
 */
export function createKnockableProps(heightAt = playgroundHeight) {
  const bodies = new Map<string, PropBody>();
  const corner = new THREE.Vector3(), axis = new THREE.Vector3(), yaw = new THREE.Quaternion();
  const dirty = new Set<PropBody>();
  function support(body: PropBody) {
    let y = -Infinity;
    for (const point of body.corners) {
      corner.copy(point).applyQuaternion(body.object.quaternion);
      y = Math.max(y, heightAt(body.object.position.x + corner.x, body.object.position.z + corner.z) - corner.y);
    }
    return y + .025;
  }
  return {
    add(id: string, object: THREE.Object3D, halfSize: THREE.Vector3, kind: PropKind, changed = () => {}) {
      if (bodies.has(id)) throw new Error(`Duplicate knockable prop: ${id}`);
      const corners: THREE.Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        corners.push(new THREE.Vector3(x * halfSize.x, y * halfSize.y, z * halfSize.z));
      }
      bodies.set(id, { object, home: object.position.clone(), homeRotation: object.quaternion.clone(),
        corners, kind, changed, velocity: new THREE.Vector3(), tumble: new THREE.Quaternion(),
        hit: false, awake: false, age: 0, maxTravel: kind === 'rail' ? 4.5 : 6 });
    },
    knock(impacts: readonly PropImpact[]) {
      for (const impact of impacts) {
        const body = bodies.get(impact.id);
        if (!body || body.hit || ![impact.x, impact.y, impact.z, impact.vx, impact.vz, impact.speed].every(Number.isFinite)) continue;
        let dx = impact.vx, dz = impact.vz;
        let length = Math.hypot(dx, dz);
        if (length < .01) {
          dx = body.home.x - impact.x; dz = body.home.z - impact.z;
          length = Math.hypot(dx, dz);
        }
        if (length < .01) { dx = 0; dz = 1; length = 1; }
        dx /= length; dz /= length;
        const seed = variation(impact.id), force = clamp(Math.abs(impact.speed) * .27, 1.8, 10);
        body.velocity.set(dx * force, 1.6 + Math.min(2.4, Math.abs(impact.speed) * .055), dz * force);
        body.age = 0; body.hit = true; body.awake = true;
        axis.set(dz, 0, -dx);
        const tilt = Math.PI * .5 + (body.kind === 'rail' ? 0 : (seed - .5) * .22);
        body.tumble.setFromAxisAngle(axis, tilt);
        yaw.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (seed - .5) * .65);
        body.tumble.premultiply(yaw).multiply(body.homeRotation);
      }
    },
    update(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const steps = Math.ceil(Math.min(dt, .1) * 120), step = Math.min(dt, .1) / steps;
      dirty.clear();
      for (let tick = 0; tick < steps; tick++) for (const body of bodies.values()) {
        if (!body.awake) continue;
        body.age += step;
        const t = Math.min(1, body.age / .64), eased = 1 - (1 - t) ** 3;
        body.object.quaternion.slerpQuaternions(body.homeRotation, body.tumble, eased);
        body.velocity.y -= 10.5 * step;
        body.object.position.addScaledVector(body.velocity, step);
        const dx = body.object.position.x - body.home.x, dz = body.object.position.z - body.home.z;
        const distance = Math.hypot(dx, dz);
        if (distance > body.maxTravel) {
          body.object.position.x = body.home.x + dx / distance * body.maxTravel;
          body.object.position.z = body.home.z + dz / distance * body.maxTravel;
          body.velocity.x = body.velocity.z = 0;
        }
        const floor = support(body), grounded = body.object.position.y <= floor;
        if (grounded) {
          body.object.position.y = floor;
          // A rotating corner may briefly touch while the body is still rising;
          // keep the upward impulse instead of cancelling its initial hop.
          if (body.velocity.y < 0) body.velocity.y = body.velocity.y < -2 && body.age < 1.2 ? -body.velocity.y * .17 : 0;
        }
        const friction = Math.exp(-(grounded ? 3.8 : .8) * step);
        body.velocity.x *= friction; body.velocity.z *= friction;
        if (body.age > .8 && grounded && body.velocity.lengthSq() < .025 || body.age >= 3) {
          body.object.quaternion.copy(body.tumble);
          body.object.position.y = support(body);
          body.velocity.set(0, 0, 0); body.awake = false;
        }
        dirty.add(body);
      }
      for (const body of dirty) { body.object.updateMatrix(); body.changed(); }
    },
    reset() {
      for (const body of bodies.values()) {
        if (!body.hit) continue;
        body.object.position.copy(body.home); body.object.quaternion.copy(body.homeRotation);
        body.velocity.set(0, 0, 0); body.hit = body.awake = false; body.age = 0;
        body.object.updateMatrix(); body.changed();
      }
    },
    get stats() {
      let moved = 0, awake = 0;
      for (const body of bodies.values()) { if (body.hit) moved++; if (body.awake) awake++; }
      return { total: bodies.size, moved, awake, asleep: moved - awake } as const;
    },
  };
}
