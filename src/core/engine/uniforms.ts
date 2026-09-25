import { Matrix4, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Uniform } from '../../shaders/tsl/types';

/**
 * GPU-visible frame state shared by every shader. Written once per frame by the engine;
 * shaders only read. Keeping these in one place stops systems from drifting out of sync.
 */
export function createFrameUniforms() {
  return {
    time: uniform(0) as Uniform<number>,
    cameraPos: uniform(new Vector3()) as Uniform<Vector3>,
    cameraWorld: uniform(new Matrix4()) as Uniform<Matrix4>,
    projectionInverse: uniform(new Matrix4()) as Uniform<Matrix4>,
    /** Unit vector toward the sun in air. */
    sunDir: uniform(new Vector3(0, 1, 0)) as Uniform<Vector3>,
    /** Unit vector along which sunlight travels underwater (after refraction), pointing down. */
    sunDirWater: uniform(new Vector3(0, -1, 0)) as Uniform<Vector3>,
    /** Metres below surface; negative in air. */
    cameraDepth: uniform(0) as Uniform<number>,
    exposure: uniform(1) as Uniform<number>,
    turbidity: uniform(0) as Uniform<number>,
    particleDensity: uniform(1) as Uniform<number>,
    /** 0 dry lens → 1 freshly out of the water. */
    wetness: uniform(0) as Uniform<number>,
    /** Surface grid origin (camera XZ snapped). */
    gridOrigin: uniform(new Vector3()) as Uniform<Vector3>,
    /** Linear-light radiance of the water column looking down from the camera. */
    belowColor: uniform(new Vector3()) as Uniform<Vector3>,
    /** Horizontal in-scatter radiance at the camera depth (for particles). */
    ambientWater: uniform(new Vector3()) as Uniform<Vector3>,
  };
}

export type FrameUniforms = ReturnType<typeof createFrameUniforms>;
