import {
  BackSide,
  Color,
  FrontSide,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type Texture,
} from 'three/webgpu';
import {
  abs,
  Fn,
  If,
  cameraViewMatrix,
  clamp,
  dot,
  float,
  length,
  max,
  mx_noise_vec3,
  mix,
  normalize,
  pmremTexture,
  positionLocal,
  positionWorld,
  pow,
  refract,
  smoothstep,
  sqrt,
  vec3,
  vec4,
  varying,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import { createSurfaceGeometry } from './surfaceGeometry';
import { gerstner } from '../../shaders/tsl/gerstner';
import { buildWaves, type Wave } from './waves';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { QualitySettings } from '../../core/quality/tiers';

const WATER_IOR = 1.333;
const DEEP_WATER = new Color(0.004, 0.034, 0.085);
const CREST_SCATTER = new Color(0.02, 0.16, 0.15);
const FOAM = new Color(0.82, 0.86, 0.86);

export class OceanSurface {
  readonly top: Mesh;
  readonly under: Mesh;
  readonly waves: Wave[];

  constructor(u: FrameUniforms, quality: QualitySettings, skyEnv: Texture) {
    this.waves = buildWaves(quality.surfaceWaves);
    const detailWaves = buildWaves(quality.surfaceWaves + 6).slice(quality.surfaceWaves);
    const geometry = createSurfaceGeometry(quality.surfaceSegments, Math.round(quality.surfaceSegments * 0.9));

    const worldXZ: ShaderNode = (positionLocal as ShaderNode).xz.add(u.gridOrigin.xz);
    const vertexDist: ShaderNode = length(worldXZ.sub(u.cameraPos.xz));
    const displaced: ShaderNode = (positionLocal as ShaderNode).add(gerstner(this.waves, worldXZ, u.time, vertexDist).offset);
    const vXZ: ShaderNode = varying(worldXZ, 'vWaterXZ');

    const fragDist: ShaderNode = length(vXZ.sub(u.cameraPos.xz));
    const main = gerstner(this.waves, vXZ, u.time, fragDist);
    const detail = gerstner(detailWaves, vXZ, u.time, fragDist);
    // Capillary ripples and wind chop: two noise-gradient octaves finer than the Gerstner set,
    // each fading out before it would alias.
    const ripple = (freq: number, speed: number, strength: number, fadeFrom: number, fadeTo: number): ShaderNode => {
      const n: ShaderNode = mx_noise_vec3(vec3(vXZ.x.mul(freq), u.time.mul(speed), vXZ.y.mul(freq)));
      const fade: ShaderNode = float(1).sub(smoothstep(fadeFrom, fadeTo, fragDist)).mul(strength);
      return vec3(n.x, 0, n.z).mul(fade);
    };
    const chop: ShaderNode = ripple(0.85, 0.9, 0.22, 25, 140).add(ripple(3.4, 1.7, 0.22, 8, 50));
    const baseNormal: ShaderNode = main.normal.add(detail.normal.sub(vec3(0, 1, 0)).mul(0.6)).add(chop);
    const normalW: ShaderNode = normalize(baseNormal);
    // The finest capillary octave only reads from below, where it breaks up Snell's window.
    const normalUnder: ShaderNode = normalize(baseNormal.add(ripple(9, 2.6, 0.08, 2, 12)));
    const normalV: ShaderNode = (cameraViewMatrix as ShaderNode).mul(vec4(normalW, 0)).xyz;

    // Whitecaps: crests where the Gerstner field pinches, broken into lacy patches by noise,
    // roughly the few-percent cover of a Beaufort 4 trade-wind sea.
    // Measured over this wave set: J < 0.64 on ~3% of the surface, J < 0.75 on ~10%.
    // The noise is only evaluated near crests (~15% of pixels), which keeps the cost low.
    const J: ShaderNode = main.jacobian;
    const foam: ShaderNode = Fn(() => {
      const result: ShaderNode = float(0).toVar();
      If(J.lessThan(0.88).and(fragDist.lessThan(500)), () => {
        const lace: ShaderNode = mx_noise_vec3(vec3(vXZ.x.mul(1.6), u.time.mul(0.25), vXZ.y.mul(1.6)));
        const breakup: ShaderNode = smoothstep(-0.5, 0.1, lace.x.add(lace.y.mul(0.5)));
        const whitecap: ShaderNode = smoothstep(0.8, 0.64, J).mul(breakup);
        const streaks: ShaderNode = smoothstep(0.88, 0.76, J).mul(smoothstep(0.2, 0.6, lace.z)).mul(0.35);
        // Bubbly texture: ridged fine noise makes lacy filaments; only dense cores stay solid.
        const fine: ShaderNode = mx_noise_vec3(vec3(vXZ.x.mul(4.5), u.time.mul(0.6), vXZ.y.mul(4.5)));
        const filaments: ShaderNode = smoothstep(0.55, 0.92, float(1).sub(abs(fine.x)).mul(float(1).sub(abs(fine.y).mul(0.5))));
        const coverage: ShaderNode = max(whitecap, streaks);
        const textured: ShaderNode = coverage.mul(mix(filaments, float(1), pow(whitecap, 3)));
        result.assign(textured.mul(float(1).sub(smoothstep(80, 500, fragDist))));
      });
      return result;
    })();

    this.top = new Mesh(geometry, this.createTopMaterial(u, displaced, normalW, normalV, foam, skyEnv));
    this.under = new Mesh(geometry, this.createUnderMaterial(u, displaced, normalUnder, foam, skyEnv));
    for (const m of [this.top, this.under]) {
      m.frustumCulled = false;
      m.name = 'ocean-surface';
    }
    this.under.renderOrder = -1;
  }

  private createTopMaterial(u: FrameUniforms, displaced: ShaderNode, normalW: ShaderNode, normalV: ShaderNode, foam: ShaderNode, env: Texture) {
    const m = new MeshPhysicalNodeMaterial({ side: FrontSide });
    m.positionNode = displaced;
    m.normalNode = normalV;
    m.envMap = env;
    m.ior = WATER_IOR;
    m.metalness = 0;
    m.colorNode = mix(vec3(0.0), FOAM, foam);
    m.roughnessNode = mix(float(0.035), float(0.85), foam);

    const pw: ShaderNode = positionWorld;
    const view: ShaderNode = normalize(u.cameraPos.sub(pw));
    const crest = clamp(pw.y.mul(0.9), 0, 1);
    const backLit = pow(max(dot(view, u.sunDir.negate()), 0), 4);
    const sunUp = clamp(u.sunDir.y.mul(1.5), 0, 1);
    const upwelling = vec3(DEEP_WATER.r, DEEP_WATER.g, DEEP_WATER.b).mul(sunUp.add(0.1));
    const scatter = vec3(CREST_SCATTER.r, CREST_SCATTER.g, CREST_SCATTER.b).mul(crest.mul(backLit.add(0.15))).mul(sunUp);
    const facing = clamp(dot(normalW, view), 0, 1);
    // Foam is a dense bubble layer that scatters light from the whole sky, not just the sun.
    const foamGlow = vec3(0.9, 0.93, 0.95).mul(foam).mul(sunUp.mul(0.9).add(0.25));
    m.emissiveNode = upwelling.add(scatter).mul(float(1).sub(foam)).mul(facing.mul(0.6).add(0.4)).add(foamGlow);
    return m;
  }

  /**
   * Seen from below: rays inside Snell's window refract out to the sky, rays beyond it are
   * totally internally reflected and show the water column beneath.
   */
  private createUnderMaterial(u: FrameUniforms, displaced: ShaderNode, normalW: ShaderNode, foam: ShaderNode, env: Texture) {
    const m = new MeshBasicNodeMaterial({ side: BackSide });
    m.positionNode = displaced;

    const pw: ShaderNode = positionWorld;
    const incident: ShaderNode = normalize(pw.sub(u.cameraPos));
    const nDown = normalW.negate();
    const refracted = refract(incident, nDown, float(WATER_IOR));
    const cosI = clamp(dot(incident, normalW), 0, 1);
    // Refraction discriminant: < 0 means total internal reflection. A soft ramp stands in for
    // the sub-pixel wave facets that blur the real edge of Snell's window.
    const k = float(1).sub(float(WATER_IOR * WATER_IOR).mul(float(1).sub(cosI.mul(cosI))));
    // Fresnel on the air side (transmitted angle): transmission falls to zero at the critical
    // angle, so the window is brightest overhead and dims naturally toward its rim.
    const cosT = sqrt(max(k, 0));
    const window = smoothstep(0.0, 0.05, k);
    const schlick = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosT), 5)));
    const fresnel = mix(float(1), schlick, window);
    // Slight roughness: the sky seen through a moving surface is never perfectly sharp.
    const sky = pmremTexture(env, normalize(refracted.add(vec3(0, 1e-4, 0))), float(0.04)).rgb;
    const transmitted = sky.mul(float(1).sub(fresnel));
    const reflected = u.belowColor.mul(fresnel);
    const foamBelow = vec3(0.35, 0.42, 0.44).mul(u.belowColor.y.mul(6).add(0.05));
    m.colorNode = mix(transmitted.add(reflected), foamBelow, foam.mul(0.8));
    return m;
  }

  update(u: FrameUniforms, cameraX: number, cameraZ: number): void {
    const snap = 2;
    const x = Math.round(cameraX / snap) * snap;
    const z = Math.round(cameraZ / snap) * snap;
    this.top.position.set(x, 0, z);
    this.under.position.set(x, 0, z);
    u.gridOrigin.value.set(x, 0, z);
  }
}
