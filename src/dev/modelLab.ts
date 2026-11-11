/** Dev-only asset review: renders every model in the manifest, lit plainly, with its bounds. */
import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import manifest from '../../assets/manifest.json';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const grid = document.getElementById('grid')!;
for (const entry of manifest) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 270;
  const label = document.createElement('span');
  cell.append(canvas, label);
  grid.append(cell);
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  const gltf = await loader.loadAsync(`/${entry.file}`);
  scene.add(gltf.scene);
  const box = new Box3().setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  const c = box.getCenter(new Vector3());
  const r = size.length() * 0.6;
  const cam = new PerspectiveCamera(40, 4 / 3, r * 0.01, r * 20);
  const low = location.search.includes("low");
  cam.position.set(c.x + r * 1.1, c.y + r * (low ? 0.15 : 0.7), c.z + r * 1.4);
  cam.lookAt(c);
  renderer.render(scene, cam);
  label.textContent = `${entry.id}  ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`;
}
document.body.dataset.done = '1';
