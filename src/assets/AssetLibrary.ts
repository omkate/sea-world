import { Box3, BufferGeometry, Float32BufferAttribute, Mesh, SRGBColorSpace, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Texture } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import manifest from '../../assets/manifest.json';

export interface ManifestEntry {
  id: string;
  file: string;
  title: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
  source: string;
  role: string;
  species: string | null;
  size: number;
  triangles: number;
  modifications: string;
  note: string;
}

export const MANIFEST = manifest as ManifestEntry[];

function toFloat(attr: BufferAttribute | InterleavedBufferAttribute): Float32BufferAttribute {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  return new Float32BufferAttribute(out, attr.itemSize);
}

export interface ScanAsset {
  entry: ManifestEntry;
  /** Single merged geometry in metres: base at y = 0, largest horizontal extent = entry.size. */
  geometry: BufferGeometry;
  /** Photographic albedo, when the scan keeps its texture. */
  map: Texture | null;
}

/**
 * Loads optimised scans (meshopt-compressed GLB) and normalises them to real-world size:
 * every mesh is baked into one geometry, stood on its base and scaled so its widest horizontal
 * extent matches the size recorded for the species in assets/sources.json.
 */
export class AssetLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly assets = new Map<string, ScanAsset>();

  async load(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadOne(id)));
  }

  get(id: string): ScanAsset {
    const a = this.assets.get(id);
    if (!a) throw new Error(`asset ${id} not loaded`);
    return a;
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  private async loadOne(id: string): Promise<void> {
    const entry = MANIFEST.find((m) => m.id === id);
    if (!entry) throw new Error(`asset ${id} missing from manifest`);
    const gltf = await this.loader.loadAsync(`${import.meta.env.BASE_URL}${entry.file}`);
    gltf.scene.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    let map: Texture | null = null;
    gltf.scene.traverse((o) => {
      // Duck-type: the loader's Mesh class can be a different module instance than ours.
      if (!(o as Mesh).isMesh) return;
      const mesh = o as Mesh;
      // Meshopt-quantized files store positions as normalized int16 with the dequantization in
      // the node transform. Expand to float first: transforming an int16 attribute in place
      // clamps every coordinate to [-1, 1] and collapses the model into a box.
      const g = new BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const attr = mesh.geometry.getAttribute(name) as BufferAttribute | InterleavedBufferAttribute | undefined;
        if (attr) g.setAttribute(name, toFloat(attr));
      }
      if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
      g.applyMatrix4(mesh.matrixWorld);
      parts.push(g);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!map && material && 'map' in material && material.map) map = material.map as Texture;
    });
    if (parts.length === 0) throw new Error(`asset ${id}: no meshes found`);
    const hasUv = parts.every((p) => p.getAttribute('uv'));
    if (!hasUv) for (const p of parts) p.deleteAttribute('uv');
    const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
    if (!merged) throw new Error(`asset ${id}: could not merge meshes`);
    if (!merged.getAttribute('normal')) merged.computeVertexNormals();

    const box = new Box3().setFromBufferAttribute(merged.getAttribute('position') as never);
    const size = box.getSize(new Vector3());
    const scale = entry.size / Math.max(size.x, size.z, 1e-6);
    const centre = box.getCenter(new Vector3());
    merged.translate(-centre.x, -box.min.y, -centre.z);
    merged.scale(scale, scale, scale);
    merged.computeBoundingSphere();
    if (map) (map as Texture).colorSpace = SRGBColorSpace;
    this.assets.set(id, { entry, geometry: merged, map });
  }
}
