# Architecture

ABYSS is one continuous camera descent. Scroll position is the only navigation input; everything else is a function of depth.

## Frame flow

```
scroll (native document) ──► ScrollInput (critically damped spring) ──► progress 0..1
progress ──► diveCurve (monotone cubic) ──► depth (m; negative = above water)
depth ──► updateDepthState ──► DepthState { pressure, temperature, light[rgb], zone, exposure, density, … }
DepthState + time ──► CameraRig ──► camera
camera + DepthState ──► FrameUniforms (one write per frame) ──► every shader reads
RenderPipeline:  scene pass ─┐
                 particle pass┴► UnderwaterPipeline (waterline · medium · lens) ─► AgX ─► FXAA
Hud (≤10 Hz, text only when changed) · DebugPanel (lazy) · DynamicResolution (frame interval)
```

Rules the code follows:

- **No DOM work in the render loop.** The HUD samples at 10 Hz and only writes text that changed.
- **Pure physics.** `src/data/zones/physics.ts`, `src/ocean/medium/optics.ts`, `src/depth/*` and `src/core/quality/*` have no side effects and are unit-tested.
- **One source of GPU truth.** `src/core/engine/uniforms.ts` holds every frame uniform. Systems never own duplicate copies.
- **CPU mirrors of GPU math.** `waveHeight()` (CPU) and `gerstnerHeight()` (TSL) share one wave set, so the camera, the waterline test and the surface always agree.
- **TSL typing.** Shader-graph code uses the `ShaderNode` alias (`src/shaders/tsl/types.ts`), because TSL's published types cannot follow swizzles. CPU code stays strictly typed.

## Source layout

| Path | Responsibility |
|---|---|
| `src/main.ts` | Capability probe → renderer → quality tier → `Experience`, or the fallback page |
| `src/core/renderer` | `WebGPURenderer` (auto-falls back to WebGL2), backend and device hints |
| `src/core/engine` | `Experience` (wiring and frame loop), frame uniforms |
| `src/core/quality` | Tiers, tier selection, dynamic resolution, 4K pixel cap |
| `src/depth` | Dive curve, scroll spring, `DepthState` |
| `src/data` | Zod schemas, site profiles, physics, species manifest |
| `src/ocean/surface` | Wave set, polar surface grid, sky and PMREM environment, surface materials |
| `src/ocean/medium` | Optics constants and the underwater screen pass |
| `src/particles/suspended` | Camera-relative suspended particulates |
| `src/camera` | Depth-driven documentary rig |
| `src/ecosystem/spawning` | Depth and site eligibility rules for species |
| `src/ui` | HUD, debug panel, fallback |

## Asset pipeline

`pnpm assets` (`scripts/fetch-assets.ts`) reads `assets/sources.json`, checks each model's licence through the Sketchfab API (the token lives in the git-ignored `.env.local`), downloads the GLB, then bakes node transforms, optionally crops stands or cut seabed, decimates to a triangle budget, re-centres on its base, converts textures to 1024 px WebP (or strips them for skeleton scans), and meshopt-compresses. Results go to `public/assets/models/` and `assets/manifest.json`.

At runtime `AssetLibrary` expands quantized attributes to float, bakes each model into one geometry and scales it to the real colony size given in the sources. Photographic scans keep their texture; museum skeleton scans get living-tissue colour in the shader. A scan is placed only if its species or genus is recorded at Guam in the species manifest. `/dev/models.html` renders every model for review.

## Rendering notes

- **Waterline.** Each pixel's near-plane point is tested against the live wave height, so the split view follows the swell across the lens.
- **Snell's window.** The underside material refracts view rays into the baked sky (n = 1.333). Beyond the critical angle it shows total internal reflection of the water below. The window appears as a consequence of the physics rather than as a texture.
- **Medium.** Light reaching a surface is multiplied by the per-band downwelling at that surface's depth. The view path then applies `e^(−σd)`. Single-scatter in-scatter is integrated analytically along the ray, with the light field decaying as `e^(−Kd·z)` and the path clamped at the sea surface.
- **Light shafts.** Computed in a separate pass at 35% of the internal resolution and disc-blurred (12 taps), which removes sampling noise with no dither pattern. The view ray is ray-marched (4–14 samples by tier, jittered per pixel). Each sample follows the refracted sun ray back to its surface entry point and reads a moving caustic pattern there, so shafts converge in perspective, drift with the waves and blur out with depth. They are energy-neutral around the mean and fade out by ~220 m.
- **Particles** are sunlit with caustic sparkle near the surface and lamp-lit in the deep. They are never smaller than 2 px; below that their alpha falls instead, which conserves energy. The density gate is independent of size.
- **Dive lamp.** It switches on from 450–650 m, as natural light becomes too dim to film by, (the L key toggles it) and lights particles with inverse-square falloff inside a cone, plus faint backscatter. Auto-exposure follows the brightest light actually present: `EV = min(ambient EV, LAMP_EV + log2(1/lamp))`.
- **Camera character.** A documentary grade desaturates deep water, a vignette is stronger underwater, and sensor grain (after tone mapping) rises with the adapted exposure and doubles as dither against 8-bit banding.
- **Particle pass** renders separately. They are composited additively, because post-effect RTT nodes reset the clear alpha to 1.
- **fp32 precision.** Wet and dry colours are combined as a weighted sum, not with `mix()`. `mix(a, b, 1) = a + (b − a)` loses deep-water radiance (~1e‑7) next to sky radiance (~10).

## Approximations (honest list)

| Area | What we do | Reality / plan |
|---|---|---|
| Surface waves | 6–12 deterministic Gerstner components | FFT/JONSWAP compute on WebGPU (Phase 2 or 12) |
| Spectral light | 3 bands (R, G, B) plus a band→display matrix (the "blue" band is ~475 nm) | Full spectral rendering is out of scope |
| Kd values | Jerlov Type I-like: R 0.35, G 0.07, B 0.022 m⁻¹ | Hand-picked, not measured at Guam |
| Pressure | `1 + ρgz/101325`, constant ρ | Ignores compressibility (~1.5% low at 11 km); TEOS-10 `p_from_z` is more accurate |
| Temperature | Monotone cubic through a hand-authored tropical western-Pacific profile | Uncertain until checked against World Ocean Atlas or CTD casts |
| Exposure | The camera adapts to 75% of light loss and stops adapting at 1,000 m | A creative convention, standing in for a low-light documentary camera |
| Marine snow shape | Larger aggregates are irregular, elongated, slowly tumbling flakes; out-of-focus ones stay round like real bokeh. Density thins with depth (e‑folding ~1.8 km) | Deep trenches may funnel extra organic matter; not modelled |
| Particle sinking | Up to ~2 cm/s so motion is visible | Real marine snow sinks ~1–100 m/day |
| Snell's window | Air-side Fresnel (transmitted angle), so the window dims toward its rim; three noise-ripple octaves add capillary detail | Real capillary waves are wind-driven and directional |
| Whitecaps | Crests where the Gerstner pinch J < ~0.64–0.8 (thresholds from measured J percentiles), broken up by noise, textured as lacy filaments | No foam persistence or advection yet; the FFT phase can track foam over time |
| Sky | Preetham-style `SkyMesh` with procedural clouds, baked to PMREM once | No time-of-day change yet |
| Light shafts | Ray-marched single scattering over a procedural caustic pattern | Real shafts come from surface focusing, which we approximate rather than trace |
| Caustics | Iterated-trig interference pattern, tiling every 6.5 m | Hidden by motion and depth blur; a wave-derived caustic map is future work |
| Dive lamp | Inverse-square cone with reduced backscatter (lamps assumed offset from the port) | The ROV convention; not a specific vehicle |
| Bioluminescent flashes | 0.15% of particles pulse blue-green (~480 nm) from 350 m, in camera-adapted units, visible only with the lamp off | Generic, unidentified plankton; species-specific displays arrive in Phase 6 |
| Sensor grain, vignette, grade | Camera conventions, not physics | Chosen to match documentary footage |
| Scale | 1 unit = 1 m. The camera is at true depth (float precision is fine to 11 km for Phase 1) | Chapter sets will use a floating origin (plan §4.1) |

## Not built yet (no UI exists for these)

Creatures, reef, seafloor caustics (there is no floor yet), audio, species bioluminescence, the discovery codex, Cinema Mode, streaming. The HUD and debug panel only show systems that exist; the debug panel reports "creatures 0 (none implemented yet)".
