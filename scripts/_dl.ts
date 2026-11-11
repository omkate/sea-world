import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const token = fs.readFileSync('.env.local', 'utf8').match(/SKETCHFAB_TOKEN=(\w+)/)![1];
const H = { headers: { Authorization: `Token ${token}` } };
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const [id, uid] of process.argv.slice(2).map(a => a.split(':'))) {
  const path = `assets/raw/${id}.glb`;
  if (!fs.existsSync(path)) {
    const info = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}`, H)).json() as any;
    const links = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, H)).json() as any;
    if (!links.glb) { console.log(id, 'no glb', info.license?.label); continue; }
    fs.writeFileSync(path, Buffer.from(await (await fetch(links.glb.url)).arrayBuffer()));
  }
  const r = (await io.read(path)).getRoot();
  const tris = r.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(id, 'tris', tris, 'skins', r.listSkins().map(s => s.listJoints().length), 'anims', r.listAnimations().map(a => `${a.getName()}(${a.listChannels().length}ch, ${a.listSamplers()[0]?.getInput()?.getMax([])[0]?.toFixed(1)}s)`), 'mats', r.listMaterials().length, 'tex', r.listTextures().length);
  console.log('  joints:', r.listSkins()[0]?.listJoints().map(j => j.getName()).slice(0, 60).join(' '));
}
