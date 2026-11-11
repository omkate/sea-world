# ABYSS — Episode 1: The Sunken Crown

A scroll-driven short film, the first episode of a series (more to come). A continuous dive off Guam: from a dive boat at the surface, over the fore-reef and down the wall to 130 m, ending in a cinematic swim-through of a shipwreck on a sand terrace at ~150 m. Rendered live with three.js (WebGPU, falling back to WebGL2).

```bash
pnpm install
pnpm dev              # http://localhost:5173
pnpm test             # unit tests (physics, dive curve, quality, optics, species, HUD)
pnpm test:e2e         # Playwright: both backends, scroll, deep links, darkening, end of dive, fallback
pnpm build
pnpm assets          # re-download and optimise licensed 3D scans (needs SKETCHFAB_TOKEN in .env.local)
```

Keys: the backtick key opens the dev panel.

URL flags: `?debug` (dev panel, also toggled by the backtick key), `?depth=127` (deep link), `?quality=ultra|high|medium|low`, `?webgl` (force WebGL2), `?fallback` (preview the no-GPU page).

Docs: [architecture](docs/architecture.md) · [ocean zones](docs/ocean-zones.md) · [species catalogue](docs/species-catalogue.md) · [performance](docs/performance.md) · [references](docs/references.md)

**Status:** surface, boat entry, reef, wall and open blue to 130 m are built and frozen. Below 130 m the dive ends in a letterboxed film sequence on the sand at ~150 m: through a rusted wreck, across the sand under a sperm whale, into a sunken castle by three doors, and to a chest at its carved portal holding a gold crown, then the end card ([architecture](docs/architecture.md#finale)). The deep-ocean chapters (twilight to hadal) were removed when the scope changed.
