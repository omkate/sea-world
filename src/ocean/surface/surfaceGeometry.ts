import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three/webgpu';

/**
 * Polar grid centred on the camera: ring spacing grows exponentially so vertex density
 * is highest where wave detail is visible and the mesh still reaches the horizon.
 */
export function createSurfaceGeometry(rings: number, segments: number, innerSpacing = 0.12, radius = 12000): BufferGeometry {
  const growth = solveGrowth(rings, innerSpacing, radius);
  const vertexCount = 1 + rings * segments;
  const positions = new Float32Array(vertexCount * 3);
  let v = 1;
  for (let r = 1; r <= rings; r++) {
    const dist = (innerSpacing * (Math.pow(growth, r) - 1)) / (growth - 1);
    const twist = (r % 2) * (Math.PI / segments);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2 + twist;
      positions[v * 3] = Math.cos(a) * dist;
      positions[v * 3 + 2] = Math.sin(a) * dist;
      v++;
    }
  }

  const indices: number[] = [];
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 0; r < rings - 1; r++) {
    const a0 = 1 + r * segments;
    const b0 = a0 + segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      indices.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.boundingSphere = new Sphere(new Vector3(), radius + 10);
  return g;
}

function solveGrowth(rings: number, inner: number, radius: number): number {
  let lo = 1.000001;
  let hi = 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const reach = (inner * (Math.pow(mid, rings) - 1)) / (mid - 1);
    if (reach < radius) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
