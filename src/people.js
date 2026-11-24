// Articulated low-poly humanoids dressed from the owner's character specs:
// box limbs on hip/shoulder pivots, a walk-cycle swing and an idle bob.
import * as THREE from 'three';

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  return matCache.get(color);
}
function limb(w, h, d, color, x, y, z, parent) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0); // pivot at the top: shoulder or hip
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Build one character; returns {group, parts} for animation. Height ~1.9 m. */
export function buildHumanoid(spec) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legL = limb(0.17, 0.92, 0.19, spec.pants, -0.12, 0.95, 0, body);
  const legR = limb(0.17, 0.92, 0.19, spec.pants, 0.12, 0.95, 0, body);
  box(0.2, 0.1, 0.3, spec.shoe, 0, -0.9, 0.04, legL);
  box(0.2, 0.1, 0.3, spec.shoe, 0, -0.9, 0.04, legR);
  box(0.48, 0.64, 0.26, spec.shirt, 0, 1.28, 0, body);
  const armColor = spec.arm === 'skin' ? spec.skin : spec.shirt;
  const armL = limb(0.13, 0.62, 0.15, armColor, -0.32, 1.56, 0, body);
  const armR = limb(0.13, 0.62, 0.15, armColor, 0.32, 1.56, 0, body);
  box(0.15, 0.12, 0.15, spec.skin, 0, -0.64, 0, armL);
  box(0.15, 0.12, 0.15, spec.skin, 0, -0.64, 0, armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), mat(spec.skin));
  head.position.set(0, 1.76, 0);
  body.add(head);
  if (spec.glasses) box(0.26, 0.05, 0.02, 0x0a0a0a, 0, 1.78, 0.14, body);
  if (spec.hat === 'bandana') {
    box(0.34, 0.11, 0.34, spec.hatColor, 0, 1.88, 0, body);
    box(0.1, 0.16, 0.05, spec.hatColor, -0.2, 1.8, -0.14, body);
  } else if (spec.hat === 'cap') {
    box(0.34, 0.09, 0.34, spec.hatColor, 0, 1.89, 0, body);
    box(0.3, 0.04, 0.2, spec.hatColor, 0, 1.85, 0.24, body);
  } else if (spec.hat === 'cop') {
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.1, 10), mat(spec.hatColor));
    capTop.position.set(0, 1.9, 0);
    body.add(capTop);
    box(0.36, 0.04, 0.22, 0x0a0f1f, 0, 1.84, 0.16, body);
  }
  if (spec.extra === 'chain') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0xe0b73a, metalness: 0.8, roughness: 0.3 }));
    chain.position.set(0, 1.48, 0.14);
    chain.rotation.x = 0.5;
    body.add(chain);
  }
  if (spec.extra === 'badge') box(0.07, 0.09, 0.02, 0xe0b73a, 0.12, 1.42, 0.14, body);
  return { group: g, body, legL, legR, armL, armR };
}

/** Pose a character: phase advances with distance walked; speed 0 gives the idle bob. */
export function pose(h, phase, moving, t) {
  const swing = moving ? Math.sin(phase) * 0.55 : 0;
  h.legL.rotation.x = swing;
  h.legR.rotation.x = -swing;
  h.armL.rotation.x = -swing * 0.8;
  h.armR.rotation.x = swing * 0.8;
  h.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : Math.sin(t * 1.6) * 0.015;
}
