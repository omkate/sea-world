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
import { center, compactPrimitive, dedup, flatten, join, metalRough, prune, quantize, reorder, simplify, textureCompress, transformMesh, transformPrimitive, weld } from '@gltf-transform/functions';
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
  /** Keep texture-seam borders fixed while decimating (photogrammetry atlases with many small charts). */
  lockBorder?: boolean;
  simplifyError?: number;
  /** Keep only triangles within this fraction of the half-width around the centre (drops cut seabed around a colony). */
  cropRadius?: number;
  /** Euler rotation in degrees (x, y, z) to stand the specimen the way it grows. */
  rotate?: [number, number, number];
  /** Drop loose pieces (scale cards, colour checkers) with fewer than this share of the main body's triangles. */
  dropIslands?: number;
  /** Longest texture edge in px (default 1024; close-up heroes use 2048 for 4K). */
  textureSize?: number;
}

/**
 * Skinned meshes store vertices in bind space and ignore their node transform; bake the rest
 * pose (Σ weight · jointWorld · inverseBind · v) into plain positions and normals, then drop the skin.
 */
function bakeSkins(doc: Document): void {
  const mul = (m: number[], v: number[], w: number): number[] => [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]! * w);
  const mat = (a: number[], b: number[]): number[] => {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
    return o;
  };
  for (const node of doc.getRoot().listNodes()) {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    if (!skin || !mesh) continue;
    const ibm = skin.getInverseBindMatrices();
    const joints = skin.listJoints().map((j, i) => mat(j.getWorldMatrix() as unknown as number[], ibm ? (ibm.getElement(i, []) as number[]) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      const nor = prim.getAttribute('NORMAL');
      const J = prim.getAttribute('JOINTS_0');
      const W = prim.getAttribute('WEIGHTS_0');
      if (!J || !W) continue;
      // Detach the accessors (they can be shared between primitives).
      const P = pos.clone();
      const N = nor?.clone();
      const j: number[] = [], w: number[] = [], v: number[] = [];
      for (let i = 0; i < pos.getCount(); i++) {
        J.getElement(i, j);
        W.getElement(i, w);
        const acc = [0, 0, 0], accN = [0, 0, 0];
        pos.getElement(i, v);
        const vn = N ? nor!.getElement(i, []) : null;
        for (let k = 0; k < 4; k++) {
          if (!w[k]) continue;
          const m = joints[j[k]!]!;
          const p = mul(m, v, 1);
          for (let c = 0; c < 3; c++) acc[c] = acc[c]! + p[c]! * w[k]!;
          if (vn) { const q = mul(m, vn, 0); for (let c = 0; c < 3; c++) accN[c] = accN[c]! + q[c]! * w[k]!; }
        }
        P.setElement(i, acc);
        if (N) { const l = Math.hypot(...accN) || 1; N.setElement(i, accN.map((c) => c / l)); }
      }
      prim.setAttribute('POSITION', P);
      if (N) prim.setAttribute('NORMAL', N);
      prim.setAttribute('JOINTS_0', null).setAttribute('WEIGHTS_0', null);
    }
    node.setSkin(null);
    // Skinned vertices are now in world space: detach the node from any transformed parent.
    const parent = node.getParentNode();
    if (parent) parent.removeChild(node);
    for (const scene of doc.getRoot().listScenes()) scene.addChild(node);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
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

/**
 * Removes loose pieces (scale cards, colour checkers beside a scan): vertices are joined by
 * position across texture seams and across primitives (a scan's atlas can span several
 * materials), and every connected piece with fewer than `share` of the largest piece's
 * triangles is dropped. The animal itself is one piece, so its thin parts stay.
 */
function dropIslands(doc: Document, share: number): void {
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices());
  // Primitives can share vertex accessors; give each its own copy so compacting one leaves the others intact.
  for (const prim of prims) {
    for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem)!.clone());
    prim.setIndices(prim.getIndices()!.clone());
  }
  // One union-find over every primitive's vertices (global ids = offset + local index).
  const offsets: number[] = [];
  let total = 0;
  for (const prim of prims) {
    offsets.push(total);
    total += prim.getAttribute('POSITION')!.getCount();
  }
  const parent = Int32Array.from({ length: total }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
    return a;
  };
  const unite = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const gmn = [Infinity, Infinity, Infinity], gmx = [-Infinity, -Infinity, -Infinity];
  for (const prim of prims) {
    const a = prim.getAttribute('POSITION')!;
    const mn = a.getMin([]), mx = a.getMax([]);
    for (let k = 0; k < 3; k++) { gmn[k] = Math.min(gmn[k]!, mn[k]!); gmx[k] = Math.max(gmx[k]!, mx[k]!); }
  }
  const q = Math.hypot(gmx[0]! - gmn[0]!, gmx[1]! - gmn[1]!, gmx[2]! - gmn[2]!) * 1e-5;
  const seen = new Map<string, number>();
  const v: number[] = [];
  prims.forEach((prim, n) => {
    const pos = prim.getAttribute('POSITION')!;
    const src = prim.getIndices()!.getArray()!;
    const o = offsets[n]!;
    for (let t = 0; t < src.length; t += 3) {
      unite(o + src[t]!, o + src[t + 1]!);
      unite(o + src[t]!, o + src[t + 2]!);
    }
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      const key = `${Math.round(v[0]! / q)},${Math.round(v[1]! / q)},${Math.round(v[2]! / q)}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, o + i);
      else unite(o + i, other);
    }
  });
  const tris = new Map<number, number>();
  prims.forEach((prim, n) => {
    const src = prim.getIndices()!.getArray()!;
    for (let t = 0; t < src.length; t += 3) {
      const r = find(offsets[n]! + src[t]!);
      tris.set(r, (tris.get(r) ?? 0) + 1);
    }
  });
  const most = Math.max(...tris.values());
  prims.forEach((prim, n) => {
    const idx = prim.getIndices()!;
    const src = idx.getArray()!;
    const kept: number[] = [];
    for (let t = 0; t < src.length; t += 3) if (tris.get(find(offsets[n]! + src[t]!))! >= most * share) kept.push(src[t]!, src[t + 1]!, src[t + 2]!);
    idx.setArray(new Uint32Array(kept));
    compactPrimitive(prim);
  });
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
    // Spec-gloss materials (no longer read by three's GLTFLoader) become metal-rough.
    await doc.transform(metalRough());
    bakeSkins(doc);
    await doc.transform(dedup(), flatten());
    bakeTransforms(doc);
    await doc.transform(join(), weld());
    if (src.rotate) rotate(doc, src.rotate);
    if (src.dropIslands) dropIslands(doc, src.dropIslands);
    if (src.cropRadius) cropRadius(doc, src.cropRadius);
    if (src.cropBelow) cropBelow(doc, src.cropBelow);
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: src.simplifyError ?? 0.01, lockBorder: src.lockBorder ?? false }), center({ pivot: 'below' }));
    if (src.textures) {
      await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [src.textureSize ?? 1024, src.textureSize ?? 1024] }));
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
      modifications: `${src.cropRadius ? 'Trimmed surrounding seabed, ' : ''}${src.cropBelow ? `Removed the lowest ${Math.round(src.cropBelow * 100)}% (stand or cut seabed), ` : ''}${src.dropIslands ? 'removed the scale card, ' : ''}${src.rotate ? 'reoriented, ' : ''}decimated ${before.toLocaleString()} → ${after.toLocaleString()} triangles, centred on base${src.textures ? `, textures resized to ${src.textureSize ?? 1024} px WebP` : ', textures removed (colour added procedurally)'}, meshopt-compressed.`,
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
