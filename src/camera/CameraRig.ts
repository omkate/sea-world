import { MathUtils, type PerspectiveCamera } from 'three/webgpu';
import { monotoneCubic, smoothstep } from '../core/math/monotoneCubic';
import { stepCriticalSpring, type Spring } from '../depth/spring';
import { CAMERA_CLEARANCE, divePathX, divePathZ, reefFloorY } from '../environments/reef/ReefSite';

/**
 * Camera pitch (degrees) by depth: horizon above water, a look back up at Snell's window just
 * after entry, then down onto the reef slope, level along the wall and gently down in the blue.
 */
const PITCH_BY_DEPTH = monotoneCubic(
  [-3.5, -0.6, 0.6, 3, 6, 10, 20, 38, 50, 70, 150, 400, 11000],
  [-11, -3, -1, 18, 20, -8, -16, -14, -8, -2, -6, -8, -12],
);

/** Yaw (degrees) toward the reef (−x) while gliding over it, back to the open water after. */
const YAW_BY_DEPTH = monotoneCubic([-3.5, 6, 12, 40, 60, 120, 11000], [0, 0, 12, 14, 18, 6, 0]);

const AIR_FOV = 55;
/** A flat camera port underwater narrows the field of view by roughly the refractive index. */
const WATER_FOV = 2 * MathUtils.radToDeg(Math.atan(Math.tan(MathUtils.degToRad(AIR_FOV / 2)) / 1.333));

export interface RigInput {
  depth: number;
  time: number;
  dt: number;
  pointerX: number;
  pointerY: number;
  surfaceHeightAtCamera: number;
  submersion: number;
}

export class CameraRig {
  private readonly yaw: Spring = { value: 0, velocity: 0 };
  private readonly pitch: Spring = { value: 0, velocity: 0 };
  constructor(private readonly camera: PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  update(i: RigInput): void {
    const cam = this.camera;
    stepCriticalSpring(this.yaw, -i.pointerX * MathUtils.degToRad(22), 2.2, i.dt);
    stepCriticalSpring(this.pitch, -i.pointerY * MathUtils.degToRad(11), 2.2, i.dt);

    const t = i.time;
    const driftX = Math.sin(t * 0.021) * 0.9 + Math.sin(t * 0.07) * 0.25;
    const driftZ = Math.cos(t * 0.017) * 1.2;

    const bob = 1 - smoothstep(0.3, 2.4, Math.abs(i.depth));
    const handX = Math.sin(t * 0.63) * 0.004 + Math.sin(t * 1.71 + 1.3) * 0.002;
    const handY = Math.sin(t * 0.47 + 0.7) * 0.005 + Math.sin(t * 1.33) * 0.002;
    const x = divePathX(i.depth) + driftX + handX;
    const z = divePathZ(i.depth) + driftZ;
    let y = -i.depth + i.surfaceHeightAtCamera * bob * 0.9 + handY;
    // Never let a noise bump in the reef put the lens inside the rock.
    y = Math.max(y, reefFloorY(x, z) + CAMERA_CLEARANCE * 0.7);
    cam.position.set(x, y, z);

    const swayYaw = Math.sin(t * 0.035) * MathUtils.degToRad(5);
    const swayPitch = Math.sin(t * 0.29 + 0.4) * 0.0025 + Math.sin(t * 0.91) * 0.0012;
    const swayRoll = Math.sin(t * 0.23) * 0.004 + bob * Math.sin(t * 0.8) * 0.02;
    cam.rotation.set(
      MathUtils.degToRad(PITCH_BY_DEPTH(i.depth)) + this.pitch.value + swayPitch,
      swayYaw + MathUtils.degToRad(YAW_BY_DEPTH(i.depth)) + this.yaw.value,
      swayRoll,
    );

    const fov = MathUtils.lerp(AIR_FOV, WATER_FOV, i.submersion);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
