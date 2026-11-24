// The Three.js stage: renderer, scene, camera and the two lights every
// system shares. The world module dresses the scene; this file only owns
// the machinery and the resize behaviour.

import * as THREE from 'three';

const FOV = 62;
const NEAR = 0.1;
const FAR = 1200;
const MAX_PIXEL_RATIO = 1.5;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x87b5d9, 180, 720);

  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR);
  camera.position.set(0, 26, 60);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a3038, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x404860, 0.4);
  scene.add(ambient);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    scene,
    camera,
    hemi,
    sun,
    ambient,
    render() {
      renderer.render(scene, camera);
    },
  };
}
