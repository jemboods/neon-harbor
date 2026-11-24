// Vehicle models: box-built cars in nine shapes, spinning wheels, light bars,
// night headlights and a mod-shop underglow plane. One factory for every car.
import * as THREE from 'three';
import { VEHICLES } from './config.js';

const matCache = new Map();
function paint(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 }));
  return matCache.get(color);
}
const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc6d8, roughness: 0.12, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.4, metalness: 0.6 });

function box(w, h, d, m, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Build the car for roster index `idx`; police=true adds the Interceptor light bar. */
export function buildCar(idx, color, police = false) {
  const spec = VEHICLES[idx];
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const len = spec.len, wid = 1.82;
  const low = spec.kind === 1 ? 0.42 : 0.55; // sport rides lower
  box(len, low, wid, paint(color), 0, 0.42 + low / 2, 0, body);
  if (spec.kind === 2) { // van: one tall box, short nose
    box(len * 0.78, 1.05, wid, paint(color), -len * 0.08, 1.35, 0, body);
    box(len * 0.3, 0.4, wid * 0.92, glassMat, len * 0.3, 1.12, 0, body);
  } else {
    box(len * 0.52, 0.48, wid * 0.88, glassMat, -len * 0.04, 0.42 + low + 0.24, 0, body);
    box(len * 0.56, 0.07, wid * 0.94, paint(color), -len * 0.04, 0.42 + low + 0.5, 0, body);
  }
  if (spec.kind === 1) box(len * 0.3, 0.06, wid * 0.9, paint(0x22262c), -len * 0.42, 1.06, 0, body); // spoiler
  if (spec.kind === 3) box(0.7, 0.22, 0.5, paint(0xf2f2f2), 0, 1.32, 0, body); // cab sign
  if (police) box(len * 0.4, 0.5, wid * 0.9, paint(0xf2f2f2), -len * 0.02, 0.95, 0, body); // white cabin band
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[len * 0.32, wid / 2], [len * 0.32, -wid / 2], [-len * 0.32, wid / 2], [-len * 0.32, -wid / 2]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(wx, 0.34, wz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 8).rotateX(Math.PI / 2), hubMat);
    w.add(hub);
    body.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0x554f33, emissive: 0xffe9a0, emissiveIntensity: 0.15 });
  box(0.08, 0.14, 0.34, headMat, len / 2 + 0.02, 0.72, 0.55, body);
  box(0.08, 0.14, 0.34, headMat, len / 2 + 0.02, 0.72, -0.55, body);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330d0d, emissive: 0xe5484d, emissiveIntensity: 0.3 });
  box(0.06, 0.12, 0.36, tailMat, -len / 2 - 0.02, 0.74, 0.55, body);
  box(0.06, 0.12, 0.36, tailMat, -len / 2 - 0.02, 0.74, -0.55, body);
  let barR = null, barB = null;
  if (police) {
    barR = box(0.34, 0.13, 0.4, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0.4 }), 0, 1.32, 0.24, body);
    barB = box(0.34, 0.13, 0.4, new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2266ff, emissiveIntensity: 2.2 }), 0, 1.32, -0.24, body);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2fb3, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.15, wid * 1.5), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.visible = false;
  g.add(glow);
  return {
    group: g, body, wheels, headMat, barR, barB, glow,
    spin: 0,
    /** Advance wheel spin by distance travelled and flash the light bar. */
    update(dist, t, siren) {
      this.spin += dist / 0.34;
      for (const w of this.wheels) w.rotation.z = -this.spin;
      if (this.barR) {
        const on = Math.sin(t * 11) > 0;
        this.barR.material.emissiveIntensity = siren && on ? 2.4 : 0.3;
        this.barB.material.emissiveIntensity = siren && !on ? 2.4 : 0.3;
      }
    },
    setHeadlights(night) { this.headMat.emissiveIntensity = night > 0.4 ? 2.2 : 0.15; },
  };
}
