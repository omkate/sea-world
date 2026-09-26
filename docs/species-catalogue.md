# ABYSS species catalogue (Mariana)

Source of truth: `src/data/species/mariana.json` (74 entries; validates against `SpeciesManifestSchema`). Depth in metres, size in metres.

Verification: **12 verified**, **62 uncertain**, 0 unverified. An entry is `uncertain` if *any* field could not be confirmed from a fetched source; those fields are listed in `uncertainFields` (most are only `visual.coloration` / `sizeTypical`). Entries flagged on depth/region are called out in the key note.

## Surface

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Indo-Pacific bluebottle (Pacific man o' war) | *Physalia utriculus* | 0–0 | verified | Replaces Physalia physalis: Physalia was split into at least four species (Church et al. 2024/25); Guam records are P. utriculus. |
| Margined flyingfish | *Cheilopogon cyanopterus* | 0–20 | verified | Listed from the Marianas (Parin 1996, 1999) in Myers & Donaldson 2003; FishBase distribution explicitly includes the Mariana Islands. |
| Brown booby | *Sula leucogaster* | 0–15 | uncertain (visual.coloration, diet) | Total length 64-74 cm, wingspan 132-150 cm (SeaLifeBase). |
| Common dolphinfish (mahimahi) | *Coryphaena hippurus* | 0–85 | verified | Usually 5-10 m depth. |

## Reef

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Staghorn / table corals | *Acropora* (genus) | 0–30 | uncertain (depthMax, sizeTypical, sizeMax, visual.coloration, diet) | Genus-level entry. |
| Lobe coral | *Porites lobata* | 0–98 | uncertain (sizeTypical, sizeMax, visual.coloration, diet) | Encrusting or forming massive heads; tolerant of exposed conditions (SeaLifeBase). |
| Cauliflower corals | *Pocillopora* (genus) | 0–30 | uncertain (depthMax, sizeTypical, sizeMax, visual.coloration, diet) | Genus-level. |
| Magnificent sea anemone | *Radianthus magnifica* | 1–50 | uncertain (sizeTypical, sizeMax, visual.coloration, diet) | Candidate 'Heteractis magnifica' is now unaccepted in WoRMS; accepted name Radianthus magnifica. |
| Orange-fin anemonefish | *Amphiprion chrysopterus* | 0–40 | uncertain (visual.coloration, sizeTypical) | Native to Guam (Myers & Donaldson 2003). |
| Red and black anemonefish | *Amphiprion melanopus* | 1–18 | uncertain (visual.coloration, sizeTypical) | Listed for Guam in Myers & Donaldson 2003 and the subject of a territorial-behaviour study on Guam (Ross 1978). |
| Convict surgeonfish | *Acanthurus triostegus* | 0–90 | verified | Grazes filamentous algae in large aggregations; juveniles abundant in tide pools. |
| Orangespine unicornfish | *Naso lituratus* | 0–90 | uncertain (sizeTypical) | Usually 5-30 m. |
| Raccoon butterflyfish | *Chaetodon lunula* | 0–170 | uncertain (visual.coloration, sizeTypical) | Largely nocturnal, usually in pairs or small groups. |
| Royal angelfish | *Pygoplites diacanthus* | 0–110 | uncertain (visual.coloration, sizeTypical) | Coral-rich areas, often near caves. |
| Pacific bullethead parrotfish | *Chlorurus spilurus* | 0–50 | uncertain (depthMin, depthMax, sizeTypical, visual.coloration, diet) | Myers & Donaldson 2003 list 'Chlorurus sordidus' for the Marianas; the Pacific population is now C. |
| Green humphead parrotfish | *Bolbometopon muricatum* | 0–40 | uncertain (visual.coloration) | Nearly extirpated at Guam; extremely rare throughout US Pacific reefs 2000-2009 (NMFS 90-day finding). |
| Bluestreak cleaner wrasse | *Labroides dimidiatus* | 0–100 | uncertain (visual.coloration, sizeTypical) | Usually 1-30 m. |
| Clown triggerfish | *Balistoides conspicillum* | 1–75 | uncertain (sizeTypical) | Solitary; along steep drop-offs; uncommon to rare through most of its range. |
| Peacock hind | *Cephalopholis argus* | 0–40 | verified | Prefers the 1-10 m reef zone; harem groups defended by a territorial male. |
| Blue-green chromis | *Chromis viridis* | 1–20 | uncertain (visual.coloration, sizeTypical) | Large aggregations hover over branching Acropora thickets and dive into them when threatened. |
| Whitetail dascyllus (humbug) | *Dascyllus aruanus* | 0–20 | verified | Aggregates above staghorn Acropora thickets. |
| Red lionfish | *Pterois volitans* | 2–55 | uncertain (sizeTypical, visual.coloration) | NATIVE in the Marianas: FishBase native range covers the western Pacific to the Marquesas; recorded at Guam since Fowler 1925. |
| Giant moray | *Gymnothorax javanicus* | 0–50 | uncertain (sizeTypical) | Largest Indo-Pacific moray (to ~3 m); solitary in reef holes. |
| Whitetip reef shark | *Triaenodon obesus* | 0–330 | verified | Usually 8-40 m. |
| Green sea turtle | *Chelonia mydas* | 0–200 | verified | Adults 3-4 ft (0.9-1.2 m). |
| Hawksbill turtle | *Eretmochelys imbricata* | 0–300 | verified | Fewer than 10 females nest annually in Guam + CNMI (NMFS/USFWS 5-year review). |
| Lesser valley brain coral | *Platygyra daedalea* | 3–30 | uncertain (sizeTypical, depthMax) | Listed for the Marianas (Randall 2003); 149 OBIS records in the Mariana box incl. NOAA CRED at Guam. |
| Bird's-nest coral | *Seriatopora hystrix* | 0–40 | uncertain (depthMax, sizeTypical) | Listed for the Marianas (Randall 2003); SeaLifeBase 0-183 m judged implausible, capped at documented ~40 m mesophotic colonies. |
| Lace hydrocoral (stylasterid) | *Stylaster sanguineus* | 30–128 | uncertain (regions, depthMin, sizeTypical, sizeMax, visual.coloration) | Mariana occurrence NOT confirmed: Randall 2003 lists Marianas Stylaster only to letter-group level; no OBIS/GBIF records in the box. Hydrozoan filed under Corals. |
| Fluted giant clam | *Tridacna squamosa* | 0–42 | verified | Guam voucher in Paulay 2003 + OBIS Guam records since 1963; SeaLifeBase/NMFS call it introduced at Guam, so native status is disputed. |

## Reef micro

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Varicose wart slug | *Phyllidia varicosa* | 10–20 | uncertain (depthMin, depthMax, visual.coloration, diet, sizeTypical) | SeaLifeBase depth (10-20 m) is from a single reference and probably too narrow. |
| Banded coral shrimp | *Stenopus hispidus* | 1–200 | uncertain (sizeTypical, sizeMax, visual.coloration) | Replaces Lysmata amboinensis (no Mariana record found). |
| Christmas tree worms | *Spirobranchus* (genus) | 3–30 | uncertain (sizeTypical, visual.coloration, adaptation) | Genus-level: S. |
| Blue sea star | *Linckia laevigata* | 0–60 | uncertain (sizeTypical, visual.coloration) | Found on sunlit rocks, dead coral and rubble. |

## Open ocean

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Yellowfin tuna | *Thunnus albacares* | 1–1602 | uncertain (visual.coloration) | Usually 1-250 m; rarely below 250 m in the tropics due to oxygen sensitivity. |
| Skipjack tuna | *Katsuwonus pelamis* | 0–260 | uncertain (visual.coloration) | Schools at the surface with birds, drifting objects, sharks and whales. |
| Spinner dolphin | *Stenella longirostris* | 0–300 | uncertain (depthMax) | Most frequently encountered nearshore cetacean in the Pacific Islands region; NOAA photo-ID work around Guam/CNMI. |
| Oceanic whitetip shark | *Carcharhinus longimanus* | 0–1082 | verified | Usually 0-152 m. |
| Reef manta ray | *Mobula alfredi* | 0–120 | uncertain (sizeTypical, visual.coloration) | Documented in Tumon Bay, Guam. |
| Sperm whale | *Physeter macrocephalus* | 0–3200 | verified | Most frequently sighted cetacean (18 sightings) on NOAA's Mariana Archipelago Cetacean Survey. |

## Twilight

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Headlight lanternfishes | *Diaphus* (genus) | 100–1400 | uncertain (sizeTypical, sizeMax, visual.coloration, visual.bioluminescenceColor, diet) | Genus-level. |
| Half-naked hatchetfish | *Argyropelecus hemigymnus* | 100–700 | uncertain (regions, visual.photophores, sizeTypical) | Usual range 100-700 m (recorded 0-2400 m). |
| Bristlemouths | *Cyclothone* (genus) | 200–2700 | uncertain (visual.photophores, sizeTypical) | Genus-level; among the most abundant vertebrates. |
| Common siphonophore | *Nanomia bijuga* | 0–800 | uncertain (regions, bioluminescent, visual.coloration) | Mostly 200-400 m. |
| Cock-eyed (jewel) squids | *Histioteuthis* (genus) | 200–1000 | uncertain (regions, diet, sizeMax) | Size from H. |
| Atolla jellyfish (alarm jelly) | *Atolla wyvillei* | 500–4000 | uncertain (regions, depthMax) | MBARI gives Atolla spp. |
| Krill | *Euphausiacea* (order) | 0–1000 | uncertain (depthMax, diet, visual.coloration) | Group-level. |

## Midnight

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Scaleless black dragonfishes | *Melanostomias* (genus) | 50–1500 | uncertain (diet, sizeTypical) | Genus-level in place of M. |
| Sloane's viperfish | *Chauliodus sloani* | 200–4700 | uncertain (sizeTypical, visual.coloration) | Usually 494-1000 m; may migrate toward the surface at night. |
| Humpback anglerfish (black seadevil) | *Melanocetus johnsonii* | 100–4500 | uncertain (visual.coloration, visual.bioluminescenceColor, sizeTypical) | Usually 100-1500 m. |
| Pelican eel (gulper eel) | *Eurypharynx pelecanoides* | 500–7625 | uncertain (regions, visual.coloration) | Usually 1200-1400 m. |
| Common fangtooth | *Anoplogaster cornuta* | 500–4992 | uncertain (sizeTypical, visual.coloration) | Adults mainly 500-2000 m (young near surface). |
| Vampire squid | *Vampyroteuthis infernalis* | 600–1200 | uncertain (regions, sizeTypical, visual.coloration) | MBARI 600-900 m; SeaLifeBase 100-3000 m (usually 900-1100). |
| Stoplight loosejaw | *Malacosteus niger* | 500–3886 | uncertain (visual.coloration, sizeTypical) | Does not undergo substantial diel migration; remains below 500 m. |
| Giant squid | *Architeuthis dux* | 200–1000 | uncertain (regions, sizeTypical, diet, visual.coloration) | Nearest OBIS record: ~27N 142E (Ogasawara, ~900 m depth). |

## Vents

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Hessler's hairy snail | *Alviniconcha hessleri* | 1400–3600 | uncertain (sizeTypical, sizeMax, visual.coloration) | Foundation species of Mariana back-arc vents; described from Alice Springs (~3600 m); Forecast Vent at 1470 m. |
| Mariana vent crab | *Austinograea williamsi* | 1450–3676 | uncertain (sizeTypical, sizeMax, diet, visual.coloration) | Lives among Alviniconcha beds at Mariana back-arc vents. |
| Mariana vent shrimp | *Rimicaris vandoverae* | 1470–3640 | uncertain (depthMin, sizeTypical, sizeMax, diet, visual.coloration) | Candidate 'Chorocaris vandoverae' is a superseded combination (WoRMS). |
| Deep-sea vent mussel | *Bathymodiolus septemdierum* | 1300–3600 | uncertain (depthMax, sizeTypical, sizeMax, diet, visual.coloration) | Occurs on both Mariana arc and back-arc vents in areas of diffuse venting. |
| Yunohana vent crab | *Gandalfus yunohana* | 400–1500 | uncertain (depthMin, depthMax, sizeTypical, sizeMax, diet, visual.coloration) | The only species found at all sampled Mariana volcanic-arc vent sites (Thomas et al. 2021). |
| Satsuma tubeworm | *Lamellibrachia satsuma* | 400–500 | uncertain (sizeTypical, sizeMax, visual.coloration) | Answers the siboglinid question: no vestimentiferans are reported from Mariana back-arc vents, but L. |
| Giant tube worm | *Riftia pachyptila* | 2500–2700 | uncertain (depthMin, depthMax, visual.coloration) | NOT present at Mariana; East Pacific Rise only. |

## Abyssal

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Peniagone sea cucumber | *Peniagone leander* | 5571–5571 | uncertain (depthMin, depthMax, sizeTypical, diet, visual.coloration) | Replaces Scotoplanes: first recorded from the Mariana Trench area at 5,571 m (J. |
| Gummy squirrel | *Psychropotes longicauda* | 1100–5173 | uncertain (regions, sizeTypical, sizeMax, visual.coloration) | No Mariana record confirmed (1 OBIS record in the W Pacific box). |
| Tripodfishes | *Bathypterois* (genus) | 878–5610 | uncertain (regions, sizeTypical, sizeMax, visual.coloration) | Genus-level. |
| Dumbo octopuses | *Grimpoteuthis* (genus) | 1000–7000 | uncertain (regions) | Mariana occurrence unconfirmed; OBIS W Pacific records ~23N 154E at 5.5-5.8 km depth. |
| Abyssal grenadier (Pacific) | *Coryphaenoides yaquinae* | 3400–7012 | uncertain (sizeTypical, diet, visual.coloration) | Deepest macrourid record: 7,012 m in the Mariana Trench (observed 4,506-7,012 m; trapped 4,441-6,081 m) (Linley et al. 2016). |
| Bone-eating worms | *Osedax* (genus) | 10–4000 | uncertain (regions) | Genus-level; 32+ species at 10-4000 m. |
| Giant hagfish | *Eptatretus carlhubbsi* | 481–1574 | uncertain (sizeTypical, sizeMax, diet, visual.coloration) | Bathyal rather than abyssal (481-1574 m) but the only deep hagfish confirmed for the region: FishBase range 'Wake Island, Guam, and Hawaii'; OBIS record at 1,016 m, 15N 145.2E. |

## Hadal

| Common name | Scientific name | Depth (m) | Verification | Key note |
|---|---|---|---|---|
| Eurythenes plasticus (scavenging amphipod) | *Eurythenes plasticus* | 6010–6949 | uncertain (sizeTypical, visual.coloration) | Described from baited traps at 6,010-6,949 m in the Mariana Trench (Weston et al. 2020). |
| Mariana snailfish | *Pseudoliparis swirei* | 6198–8178 | uncertain (sizeTypical, visual.coloration) | Usually 7,000-8,000 m; aggregates at bait and feeds on amphipod swarms. |
| Giant hadal amphipod | *Hirondellea gigas* | 7353–10900 | uncertain (depthMin, visual.coloration) | Collected ~10,897 m in Challenger Deep; lives in swarms at or below ~10,000 m (NatGeo); shallowest OBIS record seen 7,353 m. |
| Hadal sea cucumbers (cf. Peniagone) | *Elpidiidae* (family) | 10876–10908 | uncertain (sizeTypical, sizeMax, diet) | 65 individuals seen at 10,876-10,908 m in Challenger Deep submersible video, tentatively Peniagone (Gallo et al. 2015). |
| Xenophyophores (giant foraminifera) | *Xenophyophoroidea* (group) | 500–10641 | uncertain (depthMin, visual.coloration) | Recorded to 10,641 m in the Sirena Deep, Mariana Trench (Scripps 2011). |
## Dropped / replaced

| Candidate | Action | Reason |
|---|---|---|
| *Physalia physalis* | Replaced by *Physalia utriculus* | *Physalia* split into ≥4 species (Church et al. 2024/25). Guam/CNMI OBIS records (~115 iNaturalist research-grade) are *P. utriculus*. |
| *Cheilopogon* (genus) | Resolved to *C. cyanopterus* | FishBase range explicitly lists the Mariana Islands; also on the Marianas checklist (8 *Cheilopogon* spp. listed). |
| *Heteractis magnifica* | Renamed *Radianthus magnifica* | Unaccepted in WoRMS (AphiaID 290090 → 854493). |
| *Amphiprion ocellaris* | Not used | Not native. Guam anemonefishes on the checklist: *A. chrysopterus*, *A. clarkii*, *A. melanopus*, *A. perideraion*. Included *A. chrysopterus* and *A. melanopus*. |
| *Chlorurus spilurus* | Kept (uncertain) | Marianas checklist lists it as *C. sordidus* (published before the split); FishBase now restricts *C. sordidus* to the Indian Ocean. |
| *Lysmata amboinensis* | Replaced by *Stenopus hispidus* | No Mariana record found (0 OBIS records in box; the only named *Lysmata* there is *L. guamensis*). *S. hispidus* has 108 records. |
| *Spirobranchus giganteus* | Genus-level *Spirobranchus* | *S. giganteus* in the strict sense is Caribbean; Indo-Pacific animals belong to the *S. corniculatus* complex. Both names occur in Mariana OBIS data. |
| *Mobula birostris* | Dropped | No confirmed post-2009 Guam record found. The 2003 checklist entry "Manta birostris" came before the split and lists *Manta alfredi* as its synonym. The NOAA giant manta page does not mention Guam. *M. alfredi* is documented (Tumon Bay, OBIS). |
| *Melanostomias melanops* | Genus-level *Melanostomias* | NOAA describes it from the North Atlantic (50–1,500 m). No Mariana record found. The OBIS Mariana box has *M. valdiviae*, *M. tentaculatus* and *M. margaritifer*. |
| *Chorocaris vandoverae* | Renamed *Rimicaris vandoverae* | Superseded combination in WoRMS. |
| Siboglinid at Mariana vents | Added *Lamellibrachia satsuma* (Mariana Arc) | No vestimentiferans are reported from Mariana back-arc vents (Thomas et al. 2021). *L. satsuma* is recorded from Nikko/Daikoku seamounts on the northern Mariana Arc (~400–500 m). |
| *Riftia pachyptila* | Kept, site `east-pacific-rise` | East Pacific Rise only; not in the Mariana region. |
| *Scotoplanes* | Replaced by *Peniagone leander* | No *Scotoplanes* record in the W Pacific OBIS box. *P. leander* is recorded from the Mariana Trench area (5,571 m). |
| *Coryphaenoides* (abyssal) | Resolved to *C. yaquinae* | Observed at 4,506–7,012 m in the Mariana Trench (the deepest macrourid record). |
| *Eurythenes* (genus) | Resolved to *E. plasticus* | Described from the Mariana Trench (6,010–6,949 m). |
| Hagfish (*Eptatretus*) | Resolved to *E. carlhubbsi* | FishBase range includes Guam. OBIS record at 1,016 m near 15N 145E. Bathyal, not abyssal. |
| Elpidiid holothurian (hadal) | Family-level Elpidiidae (cf. *Peniagone*) | Challenger Deep video, 10,876–10,908 m, genus only tentative. |
| Added | *Gandalfus yunohana* | Only species found at every sampled Mariana volcanic-arc vent. |

## Open questions

- **Occurrence not confirmed locally** (only W Pacific or global records): *Nanomia bijuga*, *Histioteuthis*, *Atolla wyvillei*, *Argyropelecus hemigymnus* (genus only in box), *Eurypharynx*, *Vampyroteuthis*, *Architeuthis* (nearest record Ogasawara ~27N), *Psychropotes*, *Bathypterois*, *Grimpoteuthis*, *Osedax*. These are marked `uncertain` on `regions`. Consider tagging them in the UI as "expected, not yet documented here".
- **Depth ranges from single localities**: *Phyllidia varicosa* (10–20 m), *Riftia* (2,564–2,673 m), *Peniagone leander* (5,571 m), *Bathymodiolus septemdierum* (1,300–1,400 m, extended to back-arc sites), *Gandalfus yunohana* (placeholder), *Hirondellea gigas* (lower bound = shallowest OBIS record seen).
- **Coloration**: many `visual.coloration` strings are standard descriptions that were not in the fetched source text (flagged). Check them against reference imagery before modelling.
- **Sizes**: typical sizes for corals, vent fauna and several reef fish are rendering estimates (flagged).
- Guam OBIS counts use a bounding box of 10–24N, 140–150E. That box includes the Mariana Trench, Trough and Arc, but also open Philippine Sea.
- *Bolbometopon muricatum* is nearly extirpated at Guam. Decide whether the experience should show it at all, or only as a rare encounter (currently `rarity: rare`).
