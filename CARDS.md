# Jet Lag: Hide & Seek - Card Reference

Cards are prioritized: **P1** = implement now, **P2** = implement soon, **P3** = implement later.

---

## Question Cards

### MATCHING (Seeker asks: "Is your nearest _____ the same as mine?")
Adapted for our digital game - auto-evaluated using station/geographic metadata.

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 1 | Nearest commercial airport | P1 | Pre-compute nearest airport per station |
| 2 | Nearest transit line | P2 | Compare connected rail lines |
| 3 | Station name length (longer/shorter) | P1 | String length comparison |
| 4 | Nearest street/path | P3 | Requires road data - skip for now |
| 5 | Same 1st admin division (country in our case) | P1 | Compare country field |
| 6 | Same 2nd admin division (region/state) | P1 | Compare region field |
| 7 | Same 3rd admin division (city/municipality) | P2 | Compare city field |
| 8 | Nearest mountain | P3 | Requires elevation data |
| 9 | Same landmass | P2 | UK vs continent vs Scandinavia |
| 10 | Nearest park | P3 | Requires POI data |
| 11 | Nearest amusement park | P3 | Requires POI data |
| 12 | Nearest zoo | P3 | Requires POI data |
| 13 | Nearest museum | P3 | Requires POI data |
| 14 | Nearest hospital | P3 | Requires POI data |
| 15 | Nearest library | P3 | Requires POI data |

### RELATIVE (Seeker asks positional comparison to their location)
These are the most strategic - they create half-plane constraints on the map.

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 16 | Is your latitude higher or lower than ours? | P1 | Direct lat comparison → horizontal line on map |
| 17 | Is your longitude higher or lower than ours? | P1 | Direct lng comparison → vertical line on map |
| 18 | Is your altitude higher or lower than ours? | P2 | Requires elevation per station |
| 19 | Are you in the same country as us? | P1 | Country field comparison |
| 20 | Are you in the same region as us? | P1 | Region field comparison |
| 21 | Is your time zone the same as ours? | P1 | Timezone per station |
| 22 | Are you closer to the coast than us? | P2 | Pre-compute coast distance |
| 23 | Are you north or south of [named city]? | P1 | Lat comparison to fixed city |
| 24 | Are you east or west of [named city]? | P1 | Lng comparison to fixed city |

### RADAR (Seeker asks: "Are you within X distance of us?")
Creates circle constraints on the map. Very powerful for narrowing search area.

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 25 | Within 5 km? | P1 | turf.distance circle |
| 26 | Within 10 km? | P1 | turf.distance circle |
| 27 | Within 25 km? | P1 | turf.distance circle |
| 28 | Within 50 km? | P1 | turf.distance circle |
| 29 | Within 100 km? | P1 | turf.distance circle |
| 30 | Within 200 km? | P1 | turf.distance circle |
| 31 | Within 500 km? | P1 | turf.distance circle |
| 32 | Custom distance (seeker chooses) | P2 | Free-form input |

### THERMOMETER (Seekers travel X distance, hider says "hotter" or "colder")
Unique mechanic - seekers must physically move before getting an answer.

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 33 | Move 5 km, hotter or colder? | P2 | Compare distance before/after move |
| 34 | Move 25 km, hotter or colder? | P2 | Compare distance before/after move |
| 35 | Move 100 km, hotter or colder? | P2 | Compare distance before/after move |
| 36 | Move 500 km, hotter or colder? | P3 | Compare distance before/after move |

### PRECISION (Direct factual questions - cheap but revealing)

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 37 | What country are you in? | P1 | Return country name |
| 38 | What is the nearest major city? | P1 | Pre-compute nearest city pop>200k |
| 39 | How far to nearest coast? (bucket) | P2 | Distance bucket: 0-10/10-50/50-200/200+ km |
| 40 | What direction is nearest capital? | P1 | Cardinal direction to nearest capital |
| 41 | How far to nearest border? (bucket) | P2 | Distance bucket |
| 42 | What operator serves your station? | P1 | Operator field on station |
| 43 | How many train lines at your station? | P1 | Count connections |
| 44 | First letter of your station name? | P1 | First char |
| 45 | Is station name longer than 10 chars? | P1 | String length check |
| 46 | Does station name contain a vowel cluster? | P2 | Regex |
| 47 | What language is your station name in? | P1 | Infer from country |
| 48 | Population of nearest city above/below 100k? | P2 | Pre-compute |
| 49 | How many countries border yours? | P1 | Lookup |

### PHOTOS (Terrain/environment clues - adapted to geographic data)
In the real show these are actual photos. We simulate with geographic metadata.

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 50 | What terrain type? (mountain/flat/coastal/hilly) | P1 | Pre-compute terrain class |
| 51 | Urban or rural? | P1 | Population density classification |
| 52 | What is the nearest body of water type? (river/lake/sea) | P2 | Pre-compute |
| 53 | Name of nearest body of water | P2 | Pre-compute |
| 54 | Describe the landscape | P1 | Generated text from metadata |
| 55 | What type of climate zone? | P3 | Climate data per region |

### TENTACLES (Proximity lists - "Of all X within Y km, which are you closest to?")

| # | Question | Priority | Digital Adaptation |
|---|----------|----------|--------------------|
| 56 | Of stations within 50km, which is nearest? | P2 | Station proximity query |
| 57 | Of capital cities within 500km, which nearest? | P2 | Capital proximity query |
| 58 | Of major hubs within 300km, which nearest? | P2 | Hub station proximity |
| 59 | Of airports within 200km, which nearest? | P3 | Airport proximity |

---

## Hider Cards (drawn when answering questions)

### TIME BONUS CARDS
Held in hand, added to hide time if still held when caught.

| # | Card | Priority | Effect |
|---|------|----------|--------|
| 60 | +15 minutes | P1 | Adds 15 game-min to hide score |
| 61 | +30 minutes | P1 | Adds 30 game-min to hide score |
| 62 | +60 minutes | P1 | Adds 60 game-min to hide score |
| 63 | +120 minutes | P2 | Adds 120 game-min to hide score |

### POWER-UP CARDS

| # | Card | Priority | Effect |
|---|------|----------|--------|
| 64 | Veto | P1 | Refuse to answer a question. Seekers get no info. |
| 65 | Randomize | P2 | Replace asked question with random unasked one from same category |
| 66 | Move | P2 | Relocate to new hiding zone. Old station revealed to seekers. Hand discarded. |
| 67 | Duplicate | P3 | Copy another card in hand. Doubles time bonuses. |
| 68 | Discard 1 / Draw 2 | P2 | Trade unwanted cards |
| 69 | Discard 2 / Draw 3 | P2 | Trade unwanted cards |
| 70 | Expand hand size +1 | P3 | Increase max hand from 6 to 7 |
| 71 | Expand hand size +2 | P3 | Increase max hand from 6 to 8 |

### CURSE CARDS (played against seekers)

| # | Card | Priority | Effect |
|---|------|----------|--------|
| 72 | Skip Turn | P1 | Seekers lose their next turn (no action) |
| 73 | No Travel | P1 | Seekers cannot travel for 30 game-minutes |
| 74 | No Questions | P1 | Seekers cannot ask questions for 30 game-minutes |
| 75 | Slow Travel | P2 | All trains take 2x duration for 60 game-minutes |
| 76 | Reverse Direction | P2 | Seekers must travel away from current position next move |
| 77 | Category Lock | P2 | Lock one question category for 60 game-minutes |
| 78 | Fog of War | P2 | Hide constraint overlays on seeker's map for 30 min |
| 79 | Detour | P3 | Seekers' next train is rerouted to a random adjacent station |
| 80 | Time Trap (place on station) | P3 | If seekers pass through, hider gains bonus time |

---

## Card Draw Rates (when hider answers questions)

| Question Category | Cards Drawn | Cards Kept |
|-------------------|-------------|------------|
| Matching | 3 | 1 |
| Relative | 3 | 1 |
| Radar | 2 | 1 |
| Thermometer | 2 | 1 |
| Precision | 1 | 1 |
| Photos | 1 | 1 |
| Tentacles | 4 | 2 |

**Hider Deck Composition** (approximate, P1 = implement now):
- 30% Time Bonus cards (mix of +15, +30, +60 min)
- 25% Curse cards
- 20% Power-up cards (Veto, Randomize, Move)
- 15% Utility cards (Draw/Discard, Expand Hand)
- 10% Rare/powerful cards (+120 min, Duplicate, Time Trap)

**Hand size**: Max 6 cards (expandable with power-ups)

---

## Implementation Priority Summary

### P1 - Implement Now (core gameplay)
- Questions: #1, 3, 5, 6, 16, 17, 19, 20, 21, 23, 24, 25-31, 37, 38, 40, 42-45, 47, 49, 50, 51, 54
- Hider cards: #60-62, 64, 72-74
- Total: ~30 questions + 6 hider cards = **minimum viable card set**

### P2 - Implement Soon (richer gameplay)
- Questions: #2, 7, 9, 18, 22, 32, 33-35, 39, 41, 46, 48, 52, 53, 56-58
- Hider cards: #63, 65-66, 68-69, 75-78
- Total: ~18 questions + 8 hider cards

### P3 - Implement Later (full experience)
- Questions: #4, 8, 10-15, 36, 55, 59
- Hider cards: #67, 70-71, 79-80
- Total: ~11 questions + 5 hider cards
