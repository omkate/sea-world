import { BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, mx_noise_vec3, normalWorld, normalize, positionWorld, smoothstep, vec3 } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { reefFloorY, reefSand } from './ReefSite';

export const TERRAIN_BOUNDS = { xMin: -150, xMax: 130, zMin: -330, zMax: 90 };

export function createReefTerrain(u: FrameUniforms, kd: readonly [number, number, number], spacing = 1.25): Mesh {
  const { xMin, xMax, zMin, zMax } = TERRAIN_BOUNDS;
  // Adaptive columns: fine across the drop-off and wall, where a uniform grid would stretch
  // each triangle over tens of metres of height.
  const xs: number[] = [];
  for (let x = xMin; x < xMax; ) {
    xs.push(x);
    x += x > 52 && x < 115 ? spacing * 0.32 : spacing;
  }
  xs.push(xMax);
  const nx = xs.length - 1;
  const nz = Math.round((zMax - zMin) / spacing);
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  const sandAttr = new Float32Array((nx + 1) * (nz + 1));
  let k = 0;
  let q = 0;
  for (let j = 0; j <= nz; j++) {
    const z = zMin + (j / nz) * (zMax - zMin);
    for (const x of xs) {
      positions[k++] = x;
      positions[k++] = reefFloorY(x, z);
      positions[k++] = z;
      sandAttr[q++] = reefSand(x, z);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('aSand', new BufferAttribute(sandAttr, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const p: ShaderNode = positionWorld;
  const n0: ShaderNode = normalWorld;
  // Fine relief the mesh cannot carry: rubble and turf texture.
  // One noise lookup per scale: fine relief the mesh cannot carry, reused for colour grain.
  const broad: ShaderNode = mx_noise_vec3(p.mul(0.6).add(11.3));
  const fine: ShaderNode = mx_noise_vec3(p.mul(4.5));
  const steep: ShaderNode = smoothstep(0.93, 0.55, n0.y);
  // Rock faces get coarser, stronger relief (strata and pocks) than gentle ground.
  const strata: ShaderNode = mx_noise_vec3(p.mul(vec3(0.9, 2.6, 0.9)));
  const normal: ShaderNode = normalize(n0.add(vec3(fine.x, 0, fine.z).mul(0.4)).add(strata.mul(steep).mul(0.55)));
  const grain: ShaderNode = fine.y.mul(0.5).add(0.5);
  const sandMask: ShaderNode = (attribute('aSand', 'float') as ShaderNode).mul(float(1).sub(steep));
  const sand: ShaderNode = vec3(0.62, 0.58, 0.47).mul(float(0.88).add(grain.mul(0.18)));
  // Reef framework: turf-covered rock, pink crustose coralline algae, scattered sponges.
  const rock: ShaderNode = mix(vec3(0.3, 0.28, 0.18), vec3(0.42, 0.36, 0.25), grain).mul(float(0.8).add(strata.y.mul(0.25).mul(steep)));
  const coralline: ShaderNode = vec3(0.58, 0.36, 0.42);
  const coralineMask: ShaderNode = smoothstep(0.3, 0.6, broad.x);
  const sponge: ShaderNode = mix(vec3(0.75, 0.42, 0.12), vec3(0.72, 0.62, 0.2), broad.z.mul(0.5).add(0.5));
  const spongeMask: ShaderNode = smoothstep(0.55, 0.68, broad.y).mul(smoothstep(0.1, 0.5, fine.x));
  let albedo: ShaderNode = mix(rock, coralline, coralineMask.mul(0.75));
  albedo = mix(albedo, sponge, spongeMask);
  albedo = mix(albedo, sand, sandMask);

  const m = new MeshBasicNodeMaterial();
  m.colorNode = underwaterLit(u, kd, {
    albedo,
    normal,
    roughness: float(0.85),
    specular: float(0.05),
    caustics: true,
  });

  const mesh = new Mesh(g, m);
  mesh.name = 'reef-terrain';
  return mesh;
}
