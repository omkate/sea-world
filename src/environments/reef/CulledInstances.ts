import { Frustum, Matrix4, Sphere, Vector3, type InstancedBufferAttribute, type InstancedMesh, type PerspectiveCamera } from 'three/webgpu';

/**
 * Keeps a full list of instances on the CPU and uploads only those inside the view frustum
 * and within visibility range, compacted to the front of the buffers. One draw call per mesh
 * regardless of how many colonies exist; only what can actually be seen costs GPU time.
 */
export class CulledInstances {
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;
  private readonly centres: Float32Array;
  private readonly radii: Float32Array;
  private readonly total: number;
  private readonly frustum = new Frustum();
  private readonly viewProj = new Matrix4();
  private readonly sphere = new Sphere();
  private readonly lastPos = new Vector3(Infinity, 0, 0);
  private readonly lastDir = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    readonly mesh: InstancedMesh,
    private readonly colorAttr: InstancedBufferAttribute,
    geometryRadius: number,
  ) {
    this.total = mesh.count;
    this.matrices = Float32Array.from(mesh.instanceMatrix.array as Float32Array);
    this.colors = Float32Array.from(colorAttr.array as Float32Array);
    this.centres = new Float32Array(this.total * 3);
    this.radii = new Float32Array(this.total);
    for (let i = 0; i < this.total; i++) {
      const o = i * 16;
      this.centres[i * 3] = this.matrices[o + 12]!;
      this.centres[i * 3 + 1] = this.matrices[o + 13]!;
      this.centres[i * 3 + 2] = this.matrices[o + 14]!;
      const sx = Math.hypot(this.matrices[o]!, this.matrices[o + 1]!, this.matrices[o + 2]!);
      this.radii[i] = geometryRadius * sx;
    }
    mesh.frustumCulled = false;
  }

  /** Re-culls when the camera has moved or turned noticeably. */
  update(camera: PerspectiveCamera, range: number): void {
    camera.getWorldDirection(this.dir);
    if (this.lastPos.distanceToSquared(camera.position) < 0.25 && this.lastDir.dot(this.dir) > 0.995) return;
    this.lastPos.copy(camera.position);
    this.lastDir.copy(this.dir);

    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj, camera.coordinateSystem);
    const out = this.mesh.instanceMatrix.array as Float32Array;
    const outColors = this.colorAttr.array as Float32Array;
    const r2 = range * range;
    let n = 0;
    for (let i = 0; i < this.total; i++) {
      const cx = this.centres[i * 3]!, cy = this.centres[i * 3 + 1]!, cz = this.centres[i * 3 + 2]!;
      const dx = cx - camera.position.x, dy = cy - camera.position.y, dz = cz - camera.position.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      this.sphere.center.set(cx, cy, cz);
      this.sphere.radius = this.radii[i]!;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      out.set(this.matrices.subarray(i * 16, i * 16 + 16), n * 16);
      outColors.set(this.colors.subarray(i * 4, i * 4 + 4), n * 4);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
