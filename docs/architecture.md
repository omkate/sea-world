# Architecture

ABYSS is one continuous, scroll-driven ocean exploration: from the dive boat at the surface, over the Guam fore-reef and down the wall to 130 m, then a cinematic finale at a shipwreck lying on a sand terrace at ~150 m. Scroll position is the only navigation input; everything else is a function of depth (and, in the finale, of finale progress).

## Scope

| Part | Depth | Status |
|---|---|---|
| Surface, boat, entry | above water → 0 m | Built |
| Reef flat, fore-reef slope, wall, open blue beside the wall | 0–130 m | Built; frozen (no changes planned) |
| Finale: the diver swims through a rusted iron hull (in at the stern, out over the bow), crosses the sand under a passing sperm whale, enters a sunken castle by three doors (a gap in the outer bastion, the gatehouse arch, the courtyard door) and finds a chest at its carved portal; the lid opens on a gold crown; end card | 130–~150 m | Built |

The original plan (a descent through the twilight, midnight, abyssal and hadal zones to the Challenger Deep at 10,935 m) was dropped: viewers did not want to scroll that far. Everything below 130 m from that plan was removed; git history keeps it.

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
Scanner (10 Hz, no DOM) ──► DiscoveryLayer (glyphs) · DiscoveryStore (localStorage) ──► Codex
```

Rules the code follows:

- **No DOM work in the render loop.** The HUD samples at 10 Hz and only writes text that changed. Discovery glyphs move only on scanner ticks (10 Hz); a CSS transition carries them between ticks.
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
| `src/depth` | Dive curve (approach to 130 m at its original pace, then the finale: `FINALE_START`, `finaleProgress`), scroll spring, `DepthState` |
| `src/data` | Zod schemas, site profiles, physics, species manifest |
| `src/ocean/surface` | Wave set, polar surface grid, sky and PMREM environment, surface materials |
| `src/ocean/medium` | Optics constants and the underwater screen pass |
| `src/particles/suspended` | Camera-relative suspended particulates |
| `src/camera` | Depth-driven documentary rig |
| `src/ecosystem/spawning` | Depth and site eligibility rules for species |
| `src/ecosystem/schooling` | CPU boids (`School`, several groups per instanced mesh; only in-range fish are packed into instance slots and drawn) and `SchoolSet` (one school per species per chapter, range culling, size-based mesh detail) |
| `src/ecosystem/predation` | `PredatorBeat`: when a rare strike happens (only while the camera is near). Currently unused: its only beat (the open-blue bait ball, 160 m) was below the cut |
| `src/environments/reef` | Reef terrain, corals, reef fish, jellies, hero animals (live above 130 m). The terrain (`ReefChapter.seabed`) is kept out of the chapter group so the wall and the wreck terrace (`TERRACE_DEPTH`, ~150 m, joined to the wall by a smooth minimum that leaves the wall above 130 m unchanged) stay drawn through the finale |
| `src/creatures/diver/seaKing.ts` | The finale's transformation: `burnAway` (the diver dissolving behind a ragged ember front), `formIn` (the king forming behind the same front), `kingMaterial` (the king's own textures, red dyed to sea colours), `Embers`; per-model bind-pose height ranges (`DIVER_RANGE`, `KING_RANGE`) |
| `src/creatures/diver` | The dive companion (`DiveCompanion`): a rigged scuba diver (swim-cycle animation plus procedural joint poses) waits seated on an inflatable dive boat moored at the start; as the scroll begins they put a hand to mask and regulator and back-roll in (spray and a foam ring where they enter), right themselves and lead the whole descent in the lower right of the frame, swimming the way the camera travels (level along the reef, head-down down the wall). Scrolling back up, they make a safety stop at ~5–7 m (level, checking the computer), ascend upright with a hand over the head, surface beside the boat, hang on the side tube, haul out over it and sit (a separate path, not the jump reversed). Fish part around the diver (`School.companion`); the diver gives way to big animals (`src/creatures/bigAnimals.ts`). The head torch comes on below 100 m. The diver keeps its own line past big animals (it gives way on screen but never turns to look at them, which read as lagging behind the scroll). In the finale it follows the shot list's path, turning round when the scroll runs backwards |
| `src/environments/openBlue` | The open blue beside the lower wall (90–130 m, live to 140 m so its last school drifts out of frame): no geometry; a skipjack school. The deeper schools, bait ball, oceanic whitetips and sperm whale pass were cut; `WhaleEncounter` and the `sperm-whale` scan are kept for the finale |
| `src/discovery` | Scanner (nearest on-screen member of each species, size-scaled range, marks only animals ≥16 px long; known species only up close) and `DiscoveryStore` (guarded `localStorage`). **Switched off** (`DISCOVERY_UI` in `flags.ts`) until the end of the build |
| `src/environments/wreck` | `WreckChapter`: the hull (one scanned side plus its mirror, leaned out and settled lower, so the scan becomes a whole hull) |
| `src/environments/castle` | `CastleChapter`: the castle ruin (a scan of a real fortress, scaled to ~58 m across its walls, its earthworks sunk 1 scan unit into the sand), the chest (rigged; its lid animation is scrubbed by the scroll) and the crown, whose glow drives `u.relic` |
| `src/environments/finale` | `finalePath.ts`: the shot list as pure functions of finale progress: diver, camera and target keys written in the frame they were measured in (hull, castle-scan units, world) and converted to world once, Catmull–Rom within each shot and never across the cut (`CUT_T`), the whale's pass, weights for camera, diver, letterbox, fade, lid, glow and end card. `FinaleDirector`: frames the camera, steers the diver, flies the whale. `ruinMaterial`: lifted photograph, procedural relief, silt and growth on upward faces, torch and crown light |
| `src/ui` | HUD (depth, temperature, pressure, light, zone: shown only with `?debug`; the film has no instrument overlay), debug panel, fallback, discovery glyphs and species card, codex, `Cinema` (finale letterbox, HUD step-back, end card; 10 Hz, CSS transitions between ticks) |

## Asset pipeline

`pnpm assets` (`scripts/fetch-assets.ts`) reads `assets/sources.json`, checks each model's licence through the Sketchfab API (the token lives in the git-ignored `.env.local`), downloads the GLB, then bakes node transforms, optionally crops stands or cut seabed, decimates to a triangle budget, re-centres on its base, converts textures to 1024 px WebP (or strips them for skeleton scans), and meshopt-compresses. For a scan captured on a beach, `dropSand` removes the baked sand: triangles in the low band that face up (the seabed, including the shaded sand under the frames, which is as dark as rust) or sample pale texels (sunlit sand). Results go to `public/assets/models/` and `assets/manifest.json`.

At runtime `AssetLibrary` expands quantized attributes to float, bakes each model into one geometry (one group per source material, keeping each material's colour, albedo, emissive and normal maps, and painted vertex colours) and scales it to the real colony size given in the sources. Photographic scans keep their texture; museum skeleton scans get living-tissue colour in the shader. A scan is placed only if its species or genus is recorded at Guam in the species manifest. `/dev/models.html` renders every model for review.

## Rendering notes

- **Waterline.** Each pixel's near-plane point is tested against the live wave height, so the split view follows the swell across the lens.
- **Snell's window.** The underside material refracts view rays into the baked sky (n = 1.333). Beyond the critical angle it shows total internal reflection of the water below. The window appears as a consequence of the physics rather than as a texture.
- **Medium.** Light reaching a surface is multiplied by the per-band downwelling at that surface's depth. The view path then applies `e^(−σd)`. Single-scatter in-scatter is integrated analytically along the ray, with the light field decaying as `e^(−Kd·z)` and the path clamped at the sea surface.
- **Light shafts.** Computed in a separate pass at 35% of the internal resolution and disc-blurred (12 taps), which removes sampling noise with no dither pattern. The view ray is ray-marched (4–14 samples by tier, jittered per pixel). Each sample follows the refracted sun ray back to its surface entry point and reads a moving caustic pattern there, so shafts converge in perspective, drift with the waves and blur out with depth. They are energy-neutral around the mean and fade out by ~220 m (so they are still faint at the wreck).
- **Particles** are sunlit with caustic sparkle near the surface. They are never smaller than 2 px; below that their alpha falls instead, which conserves energy. The density gate is independent of size.
- **Dive lamp.** Still wired (inverse-square cone, auto-exposure `EV = min(ambient EV, LAMP_EV + log2(1/lamp))`, L key), but it switches on from 450–650 m, below the end of the dive, so it never lights. The wreck interior may reuse it.
- **Diver's torch.** `underwaterLit({ torch: true })` adds a cone light from the diver's head torch (`u.torch`, `u.torchPos`, `u.torchDir`, written by `DiveCompanion`), with inverse-square falloff and the water's extinction along the beam, in camera-adapted units. It is gated to camera depths below 130 m, so nothing above changes; the wreck and the seabed take it.
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
| Sensor grain, vignette, grade | Camera conventions, not physics | Chosen to match documentary footage |
| Fish and jelly colour | A "subject light" (`underwaterLit`, `subject`) adds light pre-divided by view-path transmittance and white balance, so animals within ~7 m read in true colour; off below 60 m | Art direction, like a documentary crew's video lights and grade. Real water at 10–20 m strips most red from unlit subjects |
| Sunlight on surfaces | The hard sun term fades with depth on the medium's directional scale (80 m) and hands its light to the diffuse light from above | Below ~100 m the light field is almost entirely diffuse |
| Camera lights | A low-power fill fades out through 60–200 m | Under the raised exposure of deep water a constant fill would blow out everything nearby |
| Sensor gain ceiling | Exposure is capped at +13 EV (`MAX_SENSOR_EV`) | A camera's gain is finite; past ~+20 EV, light drawn in camera-adapted units would also fall below fp16 and vanish |
| Hero rig | `underwaterLit({ hero })`: a key light above and beside the lens and a cool back rim (`HERO_KEY`, `HERO_RIM`, `HERO_SPEC`) in camera-adapted units, pre-corrected for the view-path extinction over the first 6 m, white balance and deep-water desaturation. Lights the diver below the shallows (fading in over 60–220 m) | Art-directed, like a film crew's lights on a subject |
| Hero locomotion | Models have no usable skeleton: a vertex wave per swimming mode — side-to-side (sharks), wing beats (mantas), an up-and-down fluke stroke (dolphins, whales) | Real whales flex the whole rear third |
| Dive companion | A scuba diver accompanies the dive to the end at ~150 m. That is technical (trimix) diving depth, well past the 40 m recreational limit; the diver's kit is artistic licence. The diver is placed in the camera's frame; the torch beam is a light cone in the additive particle layer and does not light the scene. Joint poses for sitting, hanging and hauling out are offsets found by posing the rig, blended over its swim cycle | A companion fixed in the water would leave the frame within seconds at scroll speed |
| Wreck | One scanned side of an iron hull (photogrammetry on a beach), mirrored about its keel line for the other side, which leans out 0.1 rad and sits 0.3 m lower and 0.5 m aft. The scan's 1024 px texture is lifted ×1.35 and broken up by procedural scale, pits and a silt-and-growth film on upward faces. Bedded 0.6 m into a level patch of the terrace (`wreckBed`) | Not a specific Guam wreck; real hulls at this depth would carry more growth, sponges and fish |
| Finale camera | A shot list keyed on finale progress, blended in from the dive rig over the first 5.6% of the finale; a slow handheld drift on top. Clearances were checked against the models' triangles when the keys were set: the camera stays ≥0.9 m from the castle and ≥1.7 m from the wreck, the diver ≥1.2 m from the wreck and ≥0.65 m from the castle (the closest point is inside the dark of the gatehouse arch, under the cut); both stay ≥1.2 m above the sand (unit-tested) | Scroll-scrubbed: when the scroll stops, the scene holds |
| Castle | A photogrammetry scan of a real castle ruin on land, not a Guam site: artistic licence. Its interiors are hollow scan shells, so the route uses only well-captured surfaces: outside, the bastion gap, the bailey, the gatehouse arch mouth, the courtyard and the portal. The passage through the gatehouse is a cut through black (`fade`) rather than geometry | A modelled interior would allow an unbroken swim through the gatehouse |
| Diver and reef | The diver is placed in the lens's frame, so on the drop-off or beside the wall the slot can fall inside the rock. Head, body and fins keep 0.9 m from the reef surface, smoothed over ~1 m so the wall's small bumps cannot make him twitch, pushed out along its normal on a critically damped spring (quick to take hold, slow to let go) | Coral colonies are not part of the height field; the diver can still brush a coral head |
| Scrolling back | The diver's heading follows the direction it actually travels along the path (a dead band of 0.12 m/s), turning round over about a second, so scrolling up it swims head-first back the way it came | — |
| Jelly translucency | Opaque jellies blend toward the open water's horizontal radiance where thin (exact over open water, approximate over the reef) | True transparency would skip the medium pass (transparent objects are drawn after it) |
| Scale | 1 unit = 1 m. The camera is at true depth (≤150 m, so no floating origin is needed) | — |

## Finale

| Part (finale progress) | What happens |
|---|---|
| Hand-over | At 130 m the dive curve switches from the approach to the finale (`FINALE_START`, 18 scrollable screens). Depth eases from 130 m to 145 m at a continuous rate; the scene is driven by `finaleProgress` (0..1), so scrolling back rewinds it |
| 0–0.30 the wreck | Establishing wide → behind the diver at the open stern → inside the hold, torch pooling on the sand → low angle as the diver rises out over the bow |
| 0.30–0.46 across the sand | The camera low behind the diver, looking up: a sperm whale (hero rig) crosses overhead against the light; the castle looms out of the blue |
| 0.46–0.62 the castle | Through the gap in the outer bastion (door 1), up into the bailey, into the middle gatehouse arch (door 2); black over 0.604–0.646 hides the cut |
| 0.62–0.80 the courtyard | The diver comes out of the inner arch (door 3) and crosses to the carved portal |
| 0.80–0.93 the find | The diver settles low before the chest at the portal, his fins stirring the silt; the lid opens (0.835–0.885) on a gold crown that rises a little and glows (0.85–0.9); the crown rises out of the chest, arcs up and settles on his head (0.892–0.927), its light flaring as it lands |
| 0.90–0.97 the change | As the crown comes to him he straightens upright in the water, legs still, and turns to face the lens (0.9–0.93); the king forms with the diver's heading and his head exactly on the diver's head, so one figure turns into the other in place. A front of light sweeps down from the crown (0.932–0.962, `seaKing.ts`): above it the diver and his gear have burned away in golden embers and the king of the sea has formed in his place, a separate rigged character (`seaking`: bearded, gold armour, crown-helm, his red cloth and plume dyed sea-blue and sea-green in the shader) in a slowed idle, turning to face the lens. Both figures sweep along their own bind-pose height, so they never show at once in the same place. The flying crown gives way to his crown-helm as the front passes his head; his torch and bubbles stop; a gold trident forms in his right hand (0.955–0.972), held upright |
| 0.97–1 end | On the king, trident in hand; crane up and back with him in the lower third; end card (0.978–0.998) |
| Life | Mackerel scad school over the wreck's hold and the courtyard, raccoon butterflyfish around the frames and the portal (`FINALE_FISH`; both recorded at 150 m off Guam). They part around the diver as he swims through. Fish, like the sets, take the torch and the crown's glow below 130 m. Silt (`Silt`) puffs up wherever the fins pass within 1.1 m of the floor (the courtyard's paving or the sand: `finaleFloorY`) |
| Ground | The wall's foot levels onto a sand terrace at ~150 m (`TERRACE_DEPTH`), flattened into level beds under the wreck (`wreckBed`) and the castle (`castleBed`). The terrain mesh runs to x = 240 so the terrace has no visible edge, and below 140 m it is all sand |
| Sites | `WRECK_SITE` (104, −152), 28 m; `CASTLE_SITE` (150, −225), 110 m scan extent, gate face toward the wreck. Both drawn below 125 m (out of frame above 130 m) |
| Film framing | Type: Cinzel (titles) and Cormorant Garamond (lines), bundled via @fontsource. The site is told as episodes; names live in `src/ui/cinema/episode.ts` (series, number, title, logline, what comes next). The opening title card sits over the boat until the dive begins. Letterbox (2.39:1 on 16:9) closes over 0.024–0.08, the HUD fades out with it; the end card (0.978–0.998: "End of Episode 1", title, "Episode 2 is coming soon") has a Back to the surface button that glides the page to the top, running the film back to the boat. Credits stay above the bars (CC-BY attribution) |

## Not built yet (no UI exists for these)

Finale polish: light shafts falling through the frames and windows, a modelled gatehouse passage in place of the cut. Audio and streaming. Discovery covers animals only: coral colonies and the giant clam are rendered but not scanned, so the codex lists them as "Not yet discoverable". The HUD and debug panel only show systems that exist.
