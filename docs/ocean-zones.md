# Ocean zones and the physics of the descent

Site: **Guam fore-reef → the wall → a wreck on a sand terrace at ~150 m.** The dive ends there; the physics functions remain valid for any depth (to the Challenger Deep, ~10,935 m), but only the sunlight zone is visited.
All functions live in `src/data/zones/physics.ts` and `src/data/sites/mariana.ts` and are covered by `tests/unit/physics.test.ts`.

## Zones (NOAA)

| Zone | Top | HUD label | Visual intent |
|---|---|---|---|
| Sunlight (epipelagic) | 0 m | SUNLIGHT ZONE | Cyan → deep blue, Snell's window, particles in the light |
| Twilight (mesopelagic) | 200 m | TWILIGHT ZONE | Blue fading steadily to near-black; never a sudden cut |
| Midnight (bathypelagic) | 1,000 m | MIDNIGHT ZONE | Sunlight is gone. Black, broken only by biological light (later phases) |
| Abyssal (abyssopelagic) | 4,000 m | ABYSSAL ZONE | Black, empty, slow |
| Hadal (hadalpelagic) | 6,000 m | HADAL ZONE | Trench scale |

Zone switching uses ±2 m hysteresis so the HUD never flickers at a boundary. The dive (≤145 m camera depth) stays in the sunlight zone; the deeper zones are kept in the physics model only.

## Quantities

| Quantity | Model | Check values |
|---|---|---|
| Pressure | `P = 1 + ρ g z / 101325` atm, ρ = 1025 kg/m³ | 10 m → 1.99 · 100 m → 10.9 · 1,000 m → 100.2 · 10,935 m → 1,086 |
| Downwelling light | `I(z) = e^(−Kd·z)` per band, Kd = [0.35, 0.07, 0.022] m⁻¹ | Blue ≈ 1.2% at 200 m |
| Light label | Mean band fraction: > 1e‑1 BRIGHT, > 1e‑2 DIM, > 1e‑4 LOW LIGHT, > 1e‑10 TRACE, else NONE | TRACE at 980 m, NONE at 1,000 m |
| Temperature | Monotone cubic through the site profile: 28.8 °C surface, ~4.2 °C at 1,000 m, 1.5 °C minimum near 4,000 m, adiabatic rise to ~2.45 °C at the floor | **Uncertain**: verify against World Ocean Atlas |
| Exposure | `EV = 0.75 · log2(1 / light)`, frozen at the 1,000 m value | The twilight zone darkens smoothly; below 1,000 m is black |
| Particle density | Surface plankton + deep chlorophyll maximum (~120 m) + marine-snow floor | Denser near the surface than in the abyss |
| Turbidity | Extra scattering from plankton, peaking at the surface and the DCM | Adds haze to the medium |

## Dive curve

Scroll progress → depth in two parts (`src/depth/diveCurve.ts`).

**Approach (surface → 130 m).** A monotone cubic spline through the original keyframes (progress over 41 scrollable screens, depth):
`(0, −3.5) (0.035, −1.4) (0.055, 0) (0.075, 3) (0.14, 10) (0.24, 25) (0.33, 50) (0.42, 100)`, plus `(0.5, 200) (0.58, 500) (0.66, 1000)`, which only shape the tangents near 130 m. The approach covers the same scroll distance as before (~18.7 screens), so every metre above 130 m is reached at the same scroll position as in the full-ocean build.

**Finale (130 → 145 m).** 18 more scrollable screens (the wreck, the swim across the sand, the castle). Depth eases out exponentially from 130 m to 145 m, starting at the approach's own descent rate (no jump in speed): about 144 m after the first 10% of the finale, then a slow settle. The finale's scenes are driven by `finaleProgress(progress)` (0..1), not by depth.

The whole curve is strictly monotonic (tested), so scrolling down always descends. The spacer is ~37.7 screens tall (was 42 for the full-ocean descent).
