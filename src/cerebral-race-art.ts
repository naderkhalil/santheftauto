import * as THREE from 'three';
import { cityToRender } from './coordinates.ts';
import type { CourseRoute } from './course-route.ts';
import type { LaunchZone } from './route.ts';

export type CerebralRaceArtPhase = 'preview' | 'countdown' | 'racing' | 'paused' | 'finished';
export type CerebralRaceArtConfig = {
  boosts: readonly (({ start: number } | { progress: number }) & { end: number; halfWidth?: number })[];
  launches: readonly (LaunchZone & { halfWidth?: number })[];
};
export type CerebralRaceTurn = {
  entry: number;
  apex: number;
  exit: number;
  direction: 'left' | 'right';
  signSide: -1 | 1;
};

/** Discover the rounded bends themselves, not every survey waypoint along a
 * straight street. Curvature is signed in the route's physical driving frame. */
export function cerebralRaceTurns(route: CourseRoute): CerebralRaceTurn[] {
  const turns: CerebralRaceTurn[] = [];
  for (const apex of route.anchorProgress.slice(1, -1)) {
    const curvature = route.routeCurvature(apex);
    if (Math.abs(curvature) < .0005) continue;
    const sign = Math.sign(curvature);
    const inSameBend = (s: number) => {
      const value = route.routeCurvature(s);
      return Math.sign(value) === sign && Math.abs(value - curvature) < .002;
    };
    let entry = apex, exit = apex;
    while (entry > 0 && apex - entry < 100 && inSameBend(entry - .5)) entry -= .5;
    while (exit < route.TRACK_LENGTH && exit - apex < 100 && inSameBend(exit + .5)) exit += .5;
    if ((exit - entry) * Math.abs(curvature) < .40) continue;
    if (turns.some(turn => Math.abs(turn.apex - apex) < 2)) continue;
    const direction = curvature > 0 ? 'right' : 'left';
    turns.push({ entry, apex, exit, direction, signSide: direction === 'right' ? -1 : 1 });
  }
  return turns;
}

/** Race-only art lives in the canonical scene: X east, render Z=-north.
 * These are visual, passable guides. Physics, route and boost timing remain
 * owned by the simulation; no object here changes a driving state. */
export function createCerebralRaceArt(
  scene: THREE.Object3D,
  route: CourseRoute,
  config: CerebralRaceArtConfig,
) {
  const group = new THREE.Group();
  group.name = 'Cerebral Valley / rainbow race daydream';
  group.userData.cerebralSkipAO = true;
  scene.add(group);

  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(resource: T): T => { resources.add(resource); return resource; };
  const basic = (color: THREE.ColorRepresentation, opacity = 1) => keep(new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, toneMapped: false,
    depthWrite: opacity >= 1, side: THREE.DoubleSide,
  }));
  const yellow = basic('#ffe875');
  const pearl = basic('#fff9df');
  const turquoise = basic('#8de8db');
  const lavender = basic('#c8b5ff');
  const blueInk = basic('#315663', .24);
  const cube = keep(new THREE.BoxGeometry(1, 1, 1));
  const diamond = keep(new THREE.OctahedronGeometry(1, 0));
  const Y = new THREE.Vector3(0, 1, 0);
  const widthAt = (s: number) => {
    const sampled = (route as CourseRoute & { roadHalfWidth?: (progress: number) => number }).roadHalfWidth;
    return sampled ? sampled(s) : route.ROAD_HALF_WIDTH;
  };

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, name: string) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name; object.castShadow = false; object.receiveShadow = false;
    parent.add(object); return object;
  }

  function box(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const object = mesh(cube, material, parent, 'Floating race trim');
    object.position.set(x, y, z); object.scale.set(w, h, d); return object;
  }

  function position(s: number, lateral = 0, height = 0): THREE.Vector3 {
    const p = route.routePoint(s, lateral);
    return cityToRender({ ...p, y: p.y + height });
  }

  /** A ribbon follows sampled terrain even on steep Hayes and winding paths. */
  function ribbon(start: number, end: number, left: number, right: number, rise: number | ((t: number) => number)) {
    const count = Math.max(2, Math.ceil((end - start) / 1.25));
    const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count, s = THREE.MathUtils.lerp(start, end, t);
      for (const [u, lateral] of [[0, left], [1, right]]) {
        const p = position(s, lateral, typeof rise === 'number' ? rise : rise(t));
        vertices.push(p.x, p.y, p.z); uv.push(u, t);
      }
      if (i) { const k = i * 2; indices.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }

  function line(parent: THREE.Object3D, points: THREE.Vector3[], color: THREE.ColorRepresentation, opacity = 1) {
    const geometry = keep(new THREE.BufferGeometry().setFromPoints(points));
    const material = keep(new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: false }));
    const object = new THREE.Line(geometry, material); parent.add(object); return object;
  }

  function chevronGeometry(direction: 'left' | 'right') {
    const shape = new THREE.Shape(), sign = direction === 'right' ? 1 : -1;
    const points = [[-.55, .59], [-.03, .59], [.60, 0], [-.03, -.59], [-.55, -.59], [.08, 0]];
    points.forEach(([x, y], i) => i ? shape.lineTo(x * sign, y) : shape.moveTo(x * sign, y));
    shape.closePath(); return keep(new THREE.ShapeGeometry(shape));
  }
  const arrows = { left: chevronGeometry('left'), right: chevronGeometry('right') };
  const turns = cerebralRaceTurns(route);
  const turnGroups: { group: THREE.Group; turn: CerebralRaceTurn; opacity: THREE.MeshBasicMaterial }[] = [];
  for (const turn of turns) {
    const turnGroup = new THREE.Group(); turnGroup.name = `${turn.direction} turn at ${Math.round(turn.apex)}m`; group.add(turnGroup);
    const arrowMaterial = basic('#ffe875'); arrowMaterial.transparent = true; arrowMaterial.depthWrite = false;
    for (const fraction of [.05, .50, .95]) {
      const s = THREE.MathUtils.lerp(turn.entry, turn.exit, fraction);
      if (config.launches.some(launch => s >= launch.progress - 1 && s <= launch.end + 3)) continue;
      const yaw = route.routeYaw(s), lateral = turn.signSide * (widthAt(s) + 2.3);
      const panel = new THREE.Group(); panel.name = `Passable ${turn.direction} corner chevrons`;
      panel.position.copy(position(s, lateral, 2.05));
      // Aim toward an approaching driver and slightly into the corner. The
      // lettering plane is never put underneath the reflected vehicle root.
      const face = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      face.addScaledVector(new THREE.Vector3(-Math.cos(yaw) * turn.signSide, 0, -Math.sin(yaw) * turn.signSide), .42).normalize();
      panel.rotation.y = Math.atan2(face.x, face.z); turnGroup.add(panel);
      box(panel, blueInk, 0, 0, -.06, 3.4, 1.45, .065);
      for (const x of [-.92, .46]) { const arrow = mesh(arrows[turn.direction], arrowMaterial, panel, `${turn.direction} arrow`); arrow.position.set(x, 0, 0); }
      box(panel, arrowMaterial, 0, -.71, .015, 3.30, .045, .025);
      // Two small floating feet are deliberately passable and visually open.
      for (const x of [-1.43, 1.43]) box(panel, turquoise, x, -.99, 0, .07, .22, .12);
    }
    turnGroups.push({ group: turnGroup, turn, opacity: arrowMaterial });
  }

  const rainbowMaterials: THREE.ShaderMaterial[] = [];
  function rainbow(span: number, opacity: number) {
    const material = keep(new THREE.ShaderMaterial({
      name: 'Cerebral / flowing iridescent acceleration paint',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { time: { value: 0 }, opacity: { value: opacity }, repeats: { value: Math.max(2, span / 4.2) } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform float time,opacity,repeats; varying vec2 vUv;
        vec3 rainbow(float t){
          vec3 p=abs(fract(vec3(t)+vec3(0.,.66667,.33333))*6.-3.);
          return mix(vec3(1.),clamp(p-1.,0.,1.),.63);
        }
        void main(){
          float edge=smoothstep(0.,.055,vUv.x)*smoothstep(0.,.055,1.-vUv.x);
          float ends=smoothstep(0.,.035,vUv.y)*smoothstep(0.,.035,1.-vUv.y);
          float phase=fract(vUv.y*repeats-time*.82);
          float arrow=1.-smoothstep(.035,.082,abs(phase-(.72-abs(vUv.x-.5)*.78)));
          arrow*=smoothstep(.035,.13,vUv.x)*smoothstep(.035,.13,1.-vUv.x);
          vec3 color=rainbow(vUv.x*.82+.03+sin(vUv.y*5.-time*.36)*.017);
          color=mix(color,vec3(1.,.99,.90),arrow*.78);
          color+=.075*sin(vUv.y*27.-time*3.);
          gl_FragColor=vec4(color,opacity*edge*ends);
        }`,
    }));
    rainbowMaterials.push(material); return material;
  }

  type Feature = { group: THREE.Group; start: number; end: number; sparkle?: THREE.InstancedMesh; seeds?: number[] };
  const features: Feature[] = [];
  const sparkleMatrix = new THREE.Matrix4(), sparkleQ = new THREE.Quaternion(), sparkleScale = new THREE.Vector3(), sparklePosition = new THREE.Vector3();
  function sparkles(parent: THREE.Group, start: number, end: number, halfWidth: number) {
    const count = 32, sparks = new THREE.InstancedMesh(diamond, pearl, count);
    sparks.name = 'Tiny sunlight diamonds at rainbow edges'; sparks.frustumCulled = false; parent.add(sparks);
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, s = THREE.MathUtils.lerp(start, end, t), side = i % 2 ? 1 : -1;
      const p = position(s, side * (halfWidth + .13), .25);
      seeds.push(p.x, p.y, p.z, i * 1.713);
      sparkleQ.setFromAxisAngle(Y, i); sparkleMatrix.compose(p, sparkleQ, sparkleScale.setScalar(.10)); sparks.setMatrixAt(i, sparkleMatrix);
    }
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return { sparkle: sparks, seeds };
  }

  for (const boost of config.boosts) {
    const beginning = 'start' in boost ? boost.start : boost.progress;
    const start = THREE.MathUtils.clamp(beginning, 0, route.TRACK_LENGTH), end = THREE.MathUtils.clamp(boost.end, start, route.TRACK_LENGTH);
    if (end - start < 1) continue;
    const feature = new THREE.Group(); feature.name = 'Cerebral Valley / rainbow accelerator'; group.add(feature);
    const half = boost.halfWidth ?? widthAt(start);
    mesh(ribbon(start, end, -half, half, .20), rainbow(end - start, .86), feature, 'Rainbow boost surface / forward-moving chevrons');
    for (const side of [-1, 1]) {
      mesh(ribbon(start, end, side * (half + .14) - .055, side * (half + .14) + .055, .21), pearl, feature, 'Pearl boost edge');
      for (const s of [start + 1, end - 1]) {
        const diamondMesh = mesh(diamond, side < 0 ? turquoise : lavender, feature, 'Rainbow pad corner jewel');
        diamondMesh.position.copy(position(s, side * (half + .34), .28)); diamondMesh.scale.set(.14, .28, .14);
      }
    }
    features.push({ group: feature, start, end, ...sparkles(feature, start, end, half) });
  }

  for (const launch of config.launches) {
    if (launch.end <= launch.progress) continue;
    const feature = new THREE.Group(); feature.name = `Alamo Square / ${launch.label}`; group.add(feature);
    const start = Math.max(0, launch.progress - 14), end = Math.min(route.TRACK_LENGTH, launch.end + 9);
    const half = Math.min(3.25, Math.max(1.9, (launch.halfWidth ?? widthAt(launch.progress)) * .78));
    // A thin painted crest follows the real park path. The modest visual lip
    // does not pretend to be a separate collision ramp or obstruct the vista.
    mesh(ribbon(start, launch.progress + .3, -half, half, t => .20 + .12 * t * t), rainbow(14, .78), feature, 'Rainbow launch crest');
    for (const side of [-1, 1]) {
      const edge: THREE.Vector3[] = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22, s = THREE.MathUtils.lerp(start, launch.progress + 1, t);
        edge.push(position(s, side * (half + .15), .22 + t * t * .45));
      }
      line(feature, edge, side < 0 ? '#a8eade' : '#dcc6ff');
      // Uprights stay at the path edges; there is no arch across the houses.
      const post = mesh(diamond, side < 0 ? turquoise : lavender, feature, 'Lift-off edge sparkle');
      post.position.copy(position(launch.progress, side * (half + .23), .95)); post.scale.set(.17, .68, .17);
    }
    // Sparse paired points trace the gliding height, leaving the central view
    // and the Painted Ladies unobstructed instead of enclosing it in a tube.
    for (const fraction of [.28, .54, .80]) {
      const s = THREE.MathUtils.lerp(launch.progress, launch.end, fraction), y = route.sampleGlidePath(s, launch) + .65;
      for (const side of [-1, 1]) {
        const p = route.routePoint(s, side * (half + .35));
        const bead = mesh(diamond, fraction === .54 ? yellow : pearl, feature, 'Glide trail / open vista');
        bead.position.copy(cityToRender({ ...p, y })); bead.scale.set(.14, .28, .14);
      }
    }
    // A soft landing carpet and two low curved wings, readable from the air.
    mesh(ribbon(launch.end - 5, launch.end + 7, -half, half, .205), rainbow(12, .46), feature, 'Pearlescent landing carpet');
    for (const side of [-1, 1]) {
      const wing: THREE.Vector3[] = [];
      for (let i = 0; i <= 26; i++) {
        const t = i / 26, s = launch.end - 5 + t * 12;
        wing.push(position(s, side * (half + .17 + Math.sin(t * Math.PI) * .85), .22 + Math.sin(t * Math.PI) * 1.05));
      }
      line(feature, wing, '#ffe8a4', .86);
    }
    features.push({ group: feature, start, end, ...sparkles(feature, start, launch.progress, half) });
  }

  let animationTime = 0;
  function update(time: number, progress: number, phase: CerebralRaceArtPhase, showTurnGuides = true) {
    group.visible = phase !== 'finished';
    if (!group.visible) return;
    if (phase !== 'paused') animationTime = Number.isFinite(time) ? time : animationTime;
    for (const material of rainbowMaterials) material.uniforms.time.value = animationTime;
    const nextTurn = turns.find(turn => progress <= turn.exit + 5);
    for (const item of turnGroups) {
      const ahead = item.turn.entry - progress, behind = progress - item.turn.exit;
      const preview = phase === 'preview';
      item.group.visible = showTurnGuides && ahead < (preview ? 165 : 235) && behind < 26 && (!preview || item.turn === nextTurn);
      if (!item.group.visible) continue;
      const fade = (1 - THREE.MathUtils.smoothstep(ahead, 165, 235)) * (1 - THREE.MathUtils.smoothstep(behind, 6, 26));
      item.opacity.opacity = fade * (preview ? .58 : .92 + Math.sin(animationTime * 2.6) * .08);
    }
    for (const feature of features) {
      feature.group.visible = progress > feature.start - 340 && progress < feature.end + 65;
      if (!feature.group.visible || !feature.sparkle || !feature.seeds) continue;
      const values = feature.seeds;
      for (let i = 0; i < feature.sparkle.count; i++) {
        const k = i * 4, seed = values[k + 3], t = (animationTime * .28 + seed) % 1;
        const p = sparklePosition.set(values[k], values[k + 1] + t * 1.35, values[k + 2]);
        const size = .07 + Math.sin(t * Math.PI) * .055;
        sparkleQ.setFromAxisAngle(Y, animationTime * .8 + seed);
        sparkleMatrix.compose(p, sparkleQ, sparkleScale.set(size, size * 1.45, size));
        feature.sparkle.setMatrixAt(i, sparkleMatrix);
      }
      feature.sparkle.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, route.START_PROGRESS, 'preview');
  return {
    group, update, turns,
    dispose() {
      scene.remove(group);
      for (const feature of features) feature.sparkle?.dispose();
      for (const resource of resources) resource.dispose();
    },
  };
}
