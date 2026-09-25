# ABYSS — The Living Ocean

A continuous, scroll-driven camera descent from the sea surface above Guam to the floor of the Mariana Trench, rendered live with three.js (WebGPU, falling back to WebGL2).

```bash
pnpm install
pnpm dev              # http://localhost:5173
pnpm test             # unit tests (physics, dive curve, quality, optics, species, HUD)
pnpm test:e2e         # Playwright: both backends, scroll, deep links, darkness, fallback
pnpm build
```

Keys: **L** toggles the dive lamp in the deep, and the backtick key opens the dev panel.

URL flags: `?debug` (dev panel, also toggled by the backtick key), `?depth=127` (deep link), `?quality=ultra|high|medium|low`, `?webgl` (force WebGL2), `?fallback` (preview the no-GPU page).

Docs: [architecture](docs/architecture.md) · [ocean zones](docs/ocean-zones.md) · [species catalogue](docs/species-catalogue.md) · [performance](docs/performance.md) · [references](docs/references.md)

**Status: Phase 1 plus the Phase 2 atmosphere pass.** Surface, waterline crossing, Snell's window, underwater medium, light shafts, caustic-lit particles and marine snow, dive lamp, sensor grain and grade, HUD, quality system and debug panel. There are no creatures yet; see the plan's roadmap for Phases 2–13.
