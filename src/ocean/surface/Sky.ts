import { BackSide, SphereGeometry, Color, DirectionalLight, HemisphereLight, MathUtils, Mesh, MeshBasicNodeMaterial, PMREMGenerator, Scene, Vector3, type Texture, type WebGPURenderer } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { normalize, positionWorld, smoothstep } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';

export interface SunConfig {
  elevationDeg: number;
  azimuthDeg: number;
}

/** Morning trade-wind sky over Guam: sun low enough to lay a glitter path, scattered cumulus. */
export const MORNING_SUN: SunConfig = { elevationDeg: 24, azimuthDeg: 168 };

export function sunDirection(cfg: SunConfig, out = new Vector3()): Vector3 {
  const phi = MathUtils.degToRad(90 - cfg.elevationDeg);
  const theta = MathUtils.degToRad(cfg.azimuthDeg);
  return out.setFromSphericalCoords(1, phi, theta);
}

/** Direction sunlight travels after refracting into water (Snell, n = 1.333), pointing down. */
export function refractedSunDirection(sun: Vector3, ior = 1.333, out = new Vector3()): Vector3 {
  const hx = -sun.x / ior;
  const hz = -sun.z / ior;
  const y = -Math.sqrt(Math.max(0, 1 - hx * hx - hz * hz));
  return out.set(hx, y, hz).normalize();
}

function configureSky(sky: SkyMesh, sun: Vector3): void {
  sky.turbidity.value = 1.7;
  sky.rayleigh.value = 1.7;
  sky.mieCoefficient.value = 0.0028;
  sky.mieDirectionalG.value = 0.82;
  sky.cloudCoverage.value = 0.34;
  sky.cloudDensity.value = 0.5;
  sky.cloudElevation.value = 0.55;
  sky.sunPosition.value.copy(sun);
}

export class OceanSky {
  readonly mesh: SkyMesh;
  readonly sun: DirectionalLight;
  readonly fill: HemisphereLight;
  readonly sunDir: Vector3;
  environment: Texture | null = null;

  constructor(cfg: SunConfig = MORNING_SUN) {
    this.sunDir = sunDirection(cfg);
    this.mesh = new SkyMesh();
    this.mesh.scale.setScalar(10000);
    this.mesh.frustumCulled = false;
    configureSky(this.mesh, this.sunDir);

    this.sun = new DirectionalLight(0xfff4e6, 3.2);
    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.fill = new HemisphereLight(0x9cc8ff, 0x0b2a3a, 0.35);
  }

  /** Bakes the sky into a prefiltered environment for reflections and Snell's window. */
  bakeEnvironment(renderer: WebGPURenderer): Texture {
    const envScene = new Scene();
    const sky = new SkyMesh();
    sky.scale.setScalar(50);
    configureSky(sky, this.sunDir);
    sky.showSunDisc.value = 1;
    envScene.add(sky);
    // Below the horizon a sea-level camera sees more ocean, not the sky model's brown haze.
    // The sky fades into deep ocean blue over ~17° so tilted wave facets darken smoothly.
    const seaMaterial = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false, color: new Color(0.012, 0.045, 0.085) });
    const dirY: ShaderNode = (normalize(positionWorld) as ShaderNode).y;
    seaMaterial.opacityNode = smoothstep(0.0, 0.3, dirY.negate());
    const sea = new Mesh(new SphereGeometry(90, 48, 24), seaMaterial);
    sea.renderOrder = 1;
    envScene.add(sea);
    const pmrem = new PMREMGenerator(renderer);
    const target = pmrem.fromScene(envScene, 0, 0.1, 100);
    pmrem.dispose();
    sea.geometry.dispose();
    seaMaterial.dispose();
    this.environment = target.texture;
    return target.texture;
  }
}
