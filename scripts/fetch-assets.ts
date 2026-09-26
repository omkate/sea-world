/**
 * Downloads curated Sketchfab models, verifies their licence, optimises them and records
 * attribution. Usage: `pnpm assets` (reads SKETCHFAB_TOKEN from .env.local, never commits it).
 *
 *   assets/sources.json      → what to fetch and how (target size, triangle budget, textures)
 *   assets/raw/<id>.glb      → original download (git-ignored)
 *   public/assets/models/<id>.glb → optimised: decimated, centred on its base, WebP textures,
 *                                    meshopt-compressed
 *   assets/manifest.json     → author, licence, source URL and modifications for every model
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { center, compactPrimitive, dedup, flatten, join, prune, quantize, reorder, simplify, textureCompress, transformMesh, transformPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export const ALLOWED_LICENSES: Record<string, string> = {
  'CC0 Public Domain': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC Attribution': 'https://creativecommons.org/licenses/by/4.0/',
};

interface Source {
  id: string;
  uid: string;
  role: string;
  species: string | null;
  size: number;
  triangles: number;
  textures: boolean;
  note: string;
  /** Remove geometry in the lowest fraction of the height: museum stands, cut seabed blocks. */
  cropBelow?: number;
  /** meshopt simplification error bound (default 0.01; larger decimates harder). */
  simplifyError?: number;
  /** Keep only triangles within this fraction of the half-width around the centre (drops cut seabed around a colony). */
  cropRadius?: number;
  /** Euler rotation in degrees (x, y, z) to stand the specimen the way it grows. */
  rotate?: [number, number, number];
}

/** Bakes every node's world transform into its mesh so crops and bounds work in world space. */
function bakeTransforms(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, node.getWorldMatrix());
  }
  for (const node of doc.getRoot().listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

/** Drops triangles whose centroid lies outside `fraction` of the horizontal half-extent. */
function cropRadius(doc: Document, fraction: number): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      const idx = prim.getIndices();
      if (!idx) continue;
      const mn = pos.getMin([]);
      const mx = pos.getMax([]);
      const cx = (mn[0]! + mx[0]!) / 2, cz = (mn[2]! + mx[2]!) / 2;
      const r = (Math.min(mx[0]! - mn[0]!, mx[2]! - mn[2]!) / 2) * fraction;
      const src = idx.getArray()!;
      const kept: number[] = [];
      const v: number[] = [];
      for (let t = 0; t < src.length; t += 3) {
        let x = 0, z = 0;
        for (let k = 0; k < 3; k++) {
          pos.getElement(src[t + k]!, v);
          x += v[0]! / 3;
          z += v[2]! / 3;
        }
        if (Math.hypot(x - cx, z - cz) <= r) kept.push(src[t]!, src[t + 1]!, src[t + 2]!);
      }
      idx.setArray(new Uint32Array(kept));
      compactPrimitive(prim);
    }
  }
}

/** Drops triangles lying entirely below `fraction` of the primitive's height, then compacts. */
function cropBelow(doc: Document, fraction: number): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      const idx = prim.getIndices();
      if (!idx) continue;
      const minY = pos.getMin([])[1]!;
      const maxY = pos.getMax([])[1]!;
      const cut = minY + (maxY - minY) * fraction;
      const src = idx.getArray()!;
      const kept: number[] = [];
      const v: number[] = [];
      for (let t = 0; t < src.length; t += 3) {
        const a = src[t]!, b = src[t + 1]!, c = src[t + 2]!;
        if (Math.max(pos.getElement(a, v)[1]!, pos.getElement(b, v)[1]!, pos.getElement(c, v)[1]!) >= cut) kept.push(a, b, c);
      }
      idx.setArray(new Uint32Array(kept));
      compactPrimitive(prim);
    }
  }
}

function rotate(doc: Document, deg: [number, number, number]): void {
  const [x, y, z] = deg.map((d) => (d * Math.PI) / 180) as [number, number, number];
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Column-major rotation matrix for Rz·Ry·Rx.
  const m = [
    cz * cy, sz * cy, -sy, 0,
    cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, 0,
    cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx, 0,
    0, 0, 0, 1,
  ] as const;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) transformPrimitive(prim, m as unknown as number[] as never);
}

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

const root = path.resolve(import.meta.dirname, '..');
const token = fs.readFileSync(path.join(root, '.env.local'), 'utf8').match(/SKETCHFAB_TOKEN=(\w+)/)?.[1];
if (!token) throw new Error('SKETCHFAB_TOKEN missing from .env.local');
const auth = { Authorization: `Token ${token}` };

async function api<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: auth });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')!.getCount()) / 3;
  return Math.round(n);
}

async function main(): Promise<void> {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const sources = JSON.parse(fs.readFileSync(path.join(root, 'assets/sources.json'), 'utf8')) as Source[];
  const only = process.argv.slice(2);
  const manifestPath = path.join(root, 'assets/manifest.json');
  const manifest: ManifestEntry[] = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
  fs.mkdirSync(path.join(root, 'assets/raw'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/assets/models'), { recursive: true });

  for (const src of sources) {
    if (only.length && !only.includes(src.id)) continue;
    const info = await api<{ name: string; license: { label: string } | null; user: { displayName: string; username: string; profileUrl: string }; viewerUrl: string }>(
      `https://api.sketchfab.com/v3/models/${src.uid}`,
    );
    const license = info.license?.label ?? 'unknown';
    if (!(license in ALLOWED_LICENSES)) {
      console.warn(`✗ ${src.id}: licence "${license}" not allowed — skipped`);
      continue;
    }

    const rawPath = path.join(root, `assets/raw/${src.id}.glb`);
    if (!fs.existsSync(rawPath)) {
      const links = await api<Record<string, { url: string }>>(`https://api.sketchfab.com/v3/models/${src.uid}/download`);
      if (!links.glb) {
        console.warn(`✗ ${src.id}: no GLB download offered — skipped`);
        continue;
      }
      const buf = Buffer.from(await (await fetch(links.glb.url)).arrayBuffer());
      fs.writeFileSync(rawPath, buf);
    }

    const doc = await io.read(rawPath);
    const before = countTriangles(doc);
    const ratio = Math.min(1, src.triangles / Math.max(1, before));
    await doc.transform(dedup(), flatten());
    bakeTransforms(doc);
    await doc.transform(join(), weld());
    if (src.rotate) rotate(doc, src.rotate);
    if (src.cropRadius) cropRadius(doc, src.cropRadius);
    if (src.cropBelow) cropBelow(doc, src.cropBelow);
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: src.simplifyError ?? 0.01 }), center({ pivot: 'below' }));
    if (src.textures) {
      await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
    } else {
      for (const m of doc.getRoot().listMaterials()) {
        m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
      }
    }
    await doc.transform(prune(), reorder({ encoder: MeshoptEncoder }), quantize());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const file = `assets/models/${src.id}.glb`;
    await io.write(path.join(root, 'public', file), doc);
    const after = countTriangles(doc);
    const kb = Math.round(fs.statSync(path.join(root, 'public', file)).size / 1024);

    const entry: ManifestEntry = {
      id: src.id,
      file,
      title: info.name,
      author: info.user.displayName || info.user.username,
      authorUrl: info.user.profileUrl,
      license,
      licenseUrl: ALLOWED_LICENSES[license]!,
      source: info.viewerUrl,
      role: src.role,
      species: src.species,
      size: src.size,
      triangles: after,
      modifications: `${src.cropRadius ? 'Trimmed surrounding seabed, ' : ''}${src.cropBelow ? `Removed the lowest ${Math.round(src.cropBelow * 100)}% (stand or cut seabed), ` : ''}${src.rotate ? 'reoriented, ' : ''}decimated ${before.toLocaleString()} → ${after.toLocaleString()} triangles, centred on base${src.textures ? ', textures resized to 1024 px WebP' : ', textures removed (colour added procedurally)'}, meshopt-compressed.`,
      note: src.note,
    };
    const i = manifest.findIndex((m) => m.id === src.id);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
    console.log(`✓ ${src.id}: ${license}, ${before} → ${after} tris, ${kb} KB`);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

void main();
