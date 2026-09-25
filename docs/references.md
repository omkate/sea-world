# References

## Existing work reviewed (for originality, not reuse)

| Project | What it is | How ABYSS differs |
|---|---|---|
| [PolyFish](https://github.com/unclemattmakes/polyfish) (MIT) | Three.js r170 + Jolt physics kelp-forest food chain, Verlet kelp, narrated auto-camera, VR, editor | No population/breeding sim, no narration, no editor. The core idea is a vertical depth journey, not a closed ecosystem tank. No code, UI or scenes are reused. |
| [The Sea We Breathe](https://www.webgpu.com/showcase/the-sea-we-breathe-an-immersive-ocean-conservation-experience/) (Unseen Studio for Blue Marine Foundation) | Three.js, baked animation plus interactivity, Stephen Fry narration, breathing intro, gesture "solve the threat" | No narration, intro ritual or conservation mini-games. We share only the principle of baking what is expensive. |

## Science

- NOAA Ocean Exploration, "Meet the Deep": five water-column zones; about 90% of water-column animals are bioluminescent; marine snow feeds the deep. <https://oceanexplorer.noaa.gov/exploration-extras/24-national-ocean-month/>
- NOAA's principle that red light is absorbed near the surface and blue penetrates deeper, so red animals appear dark at depth. Implemented physically in the medium pass (no per-creature tinting).
- Jerlov water types, clear oceanic (Type I) diffuse attenuation: the basis for the Kd values in `src/data/sites/mariana.ts` (hand-picked; see architecture.md § Approximations).
- Seawater pressure: hydrostatic `ρgz`. TEOS-10 (`gsw.p_from_z`) is the reference for a future compressibility correction.
- Species sources: per entry in `src/data/species/mariana.json` (`sources[]`), summarised in `docs/species-catalogue.md`. Main references: Myers & Donaldson 2003 (Mariana fish checklist), OBIS occurrence queries (10–24°N, 140–150°E), FishBase, SeaLifeBase, WoRMS, NOAA, MBARI and Smithsonian.

## Engine

- three.js r186: `WebGPURenderer`, TSL, `RenderPipeline`, `SkyMesh`, `PMREMGenerator`, `FXAANode`.
- Gerstner waves: Tessendorf, "Simulating Ocean Water" (2001); Finch, *GPU Gems* ch. 1 (2004).
- Fritsch & Carlson (1980), monotone piecewise cubic interpolation (dive curve, temperature).

## Assets

None yet. Every future asset must have an entry (source URL, author, license, modifications) in `assets/manifest.json` before it ships.
