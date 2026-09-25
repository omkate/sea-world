import { MathUtils, type PerspectiveCamera } from 'three/webgpu';
import { monotoneCubic, smoothstep } from '../core/math/monotoneCubic';
import { stepCriticalSpring, type Spring } from '../depth/spring';

/** Camera pitch (degrees) by depth: horizon above water, looking back up at the receding surface, then down. */
const PITCH_BY_DEPTH = monotoneCubic(
  [-3.5, -0.6, 0.6, 4, 12, 30, 70, 150, 400, 11000],
  [-11, -3, -1, 22, 35, 26, 5, -6, -8, -12],
);

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
  private readonly x: number;
  private readonly z: number;

  constructor(
    private readonly camera: PerspectiveCamera,
    origin = { x: 0, z: 0 },
  ) {
    this.x = origin.x;
    this.z = origin.z;
    camera.rotation.order = 'YXZ';
  }

  update(i: RigInput): void {
    const cam = this.camera;
    stepCriticalSpring(this.yaw, -i.pointerX * MathUtils.degToRad(22), 2.2, i.dt);
    stepCriticalSpring(this.pitch, -i.pointerY * MathUtils.degToRad(11), 2.2, i.dt);

    const t = i.time;
    const driftX = Math.sin(t * 0.021) * 3.5 + t * 0.06;
    const driftZ = -t * 0.12 + Math.cos(t * 0.017) * 2.5;

    const bob = 1 - smoothstep(0.3, 2.4, Math.abs(i.depth));
    const handX = Math.sin(t * 0.63) * 0.004 + Math.sin(t * 1.71 + 1.3) * 0.002;
    const handY = Math.sin(t * 0.47 + 0.7) * 0.005 + Math.sin(t * 1.33) * 0.002;
    cam.position.set(this.x + driftX + handX, -i.depth + i.surfaceHeightAtCamera * bob * 0.9 + handY, this.z + driftZ);

    const swayYaw = Math.sin(t * 0.035) * MathUtils.degToRad(9);
    const swayPitch = Math.sin(t * 0.29 + 0.4) * 0.0025 + Math.sin(t * 0.91) * 0.0012;
    const swayRoll = Math.sin(t * 0.23) * 0.004 + bob * Math.sin(t * 0.8) * 0.02;
    cam.rotation.set(
      MathUtils.degToRad(PITCH_BY_DEPTH(i.depth)) + this.pitch.value + swayPitch,
      swayYaw + this.yaw.value,
      swayRoll,
    );

    const fov = MathUtils.lerp(AIR_FOV, WATER_FOV, i.submersion);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
