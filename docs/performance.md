# Performance

## Budgets (High tier, per frame)

| Budget | Target | Phase 1 measured* |
|---|---|---|
| Frame time | 16.6 ms | 16.7 ms (vsync-locked at 60 FPS) |
| Draw calls | ≤ 250 | 6 |
| Triangles | ≤ 3 M | 0.37 M |
| Suspended particles | 36 k (Ultra 60 k, Low 8 k) | 36 k |
| Hero creatures | ≤ 4 | 0 (none implemented) |

\*Intel Iris Xe (Raptor Lake-P), headless Chrome, 1280×720 viewport, WebGPU and WebGL2 backends, recorded from the debug panel. These are indicative numbers, not a profile.

## Quality tiers (`src/core/quality/tiers.ts`)

| Tier | Render scale | Pixel cap | Surface grid | Waves | Particles | Lens FX |
|---|---|---|---|---|---|---|
| Ultra | 0.6–1.0 | 3840×2160 | 384 rings | 12 | 60 k | yes |
| High | 0.55–1.0 | 2560×1440 | 288 | 10 | 36 k | yes |
| Medium | 0.5–0.85 | 1920×1080 | 192 | 8 | 18 k | yes |
| Low | 0.45–0.7 | 1280×720 | 128 | 6 | 8 k | no |

- **Selection.** Mobile gets Low. Desktop is scored on WebGPU availability, core count, memory, max texture size and GPU vendor. `?quality=ultra|high|medium|low` overrides the choice.
- **Dynamic resolution.** Averages the frame *interval* (so GPU-bound frames count) over 0.75 s. It steps the scale down above 112% of budget and up below 78%. The dead band prevents oscillation.
- **Watchdog.** If the scale is already at minimum and frames are still above 150% of budget for 3 windows, the tier steps down (particles, lens FX, resolution range).

## Checking

- Open `/?debug`, or press the backtick key: FPS, frame time, draw calls, triangles, textures, backend, tier, render resolution and particle count.
- `pnpm test:e2e` runs both backends headless.
