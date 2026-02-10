# Jet Lag: Hide & Seek - Web Game

## Context

We're building a web game inspired by "Jet Lag: The Game" (YouTube/Nebula show) - specifically the **Hide & Seek** format set in **Europe's train network**. The human player competes against **2 AI agents controlled by different LLM models** (selected at game start). The game uses **Mapbox GL JS** for map rendering and runs with **accelerated time** (1 real second = 0.5 game minutes, so 1 game hour = 2 real minutes).

Key design principles:
- **All players are equal clients**: Human and AI agents use the exact same tools and see the exact same filtered information. The human's UI is just a visual wrapper around the same tool API.
- **Agents cannot cheat**: All players interact through a strict tool API. The game engine is the source of truth and filters information by role.
- **Seekers travel together**: The two seekers are always at the same station and must reach **consensus** before any action is taken.
- **Dominance skill**: Each player gets a secret randomized dominance score at game start, affecting how persistent they are in negotiations.
- **Realistic train schedules with delays**: Simulated timetables with departures, frequencies, and a delay engine producing realistic disruptions. Schedule engine is a first-class tool - players can browse future departures, plan multi-leg routes, and check connections.
- **Past timetable forensics**: Seekers can view past departures to deduce which trains the hider may have taken during the hiding phase.
- **Hider time control**: During the hiding phase, the hider can speed up time (up to 4x) to fast-forward through waiting/travel.
- **Debug communications log**: All agent tool calls, messages, and game events are logged to a viewable `communications.log` panel for debugging.
- **Card-draw system**: Hider draws cards (time bonuses, power-ups, curses) when answering questions instead of earning coins. See `CARDS.md` for full card reference.
- **Each AI agent uses a different LLM model**, chosen by the player at game start.

---

## Game Rules

### Overview
3 players take turns being the Hider (3 rounds). The Hider travels Europe's train network and picks a hiding spot. The 2 Seekers travel **together** as a team, discussing and agreeing on every move. **Best cumulative hide time wins.**

### Rounds
1. Each round, one player is Hider, the other two are Seekers
2. **Hiding Phase (4 game-hours = ~8 real minutes)**: Hider travels and settles at a station, establishing a hiding zone (0.8km radius circle). **Hider can speed up time** during this phase (up to 4x, so 1 sec = 2 game-min) to fast-forward through waiting and travel. Seekers are frozen/inactive during hiding phase.
3. **Seeking Phase**: The seeker team discusses and acts together. Each turn involves a **discussion → consensus → action** cycle. Questions can be asked continuously (30-min cooldown per category).
4. Round ends when seekers enter the hiding zone, or time limit (12 game-hours) is reached
5. Score = game-minutes hidden (+ time bonus cards). After 3 rounds, highest cumulative score wins

### Card Economy (replaces coins - see CARDS.md for full reference)
- When seekers ask questions, the **hider draws cards** from the Hider Deck
- Cards include: **Time Bonuses** (+15/30/60 min to hide score), **Power-ups** (Veto, Randomize, Move), **Curses** (Skip Turn, No Travel, Fog of War, etc.)
- Draw rate depends on question category (expensive questions = more cards drawn)
- Hider has a max hand size of 6 cards
- Seekers share a coin pool (earned passively) for transport costs only
- Train travel costs coins based on speed tier

### Question Categories (6 types, 30-min cooldown per category)

| Category | Cards Drawn/Kept | Example |
|----------|-----------------|---------|
| **Matching** | Draw 3, Keep 1 | "Is your nearest airport the same as mine?" |
| **Relative** | Draw 3, Keep 1 | "Is your latitude higher or lower than ours?" |
| **Radar** | Draw 2, Keep 1 | "Are you within 100km of us?" |
| **Thermometer** | Draw 2, Keep 1 | Seekers move, hider says "hotter" or "colder" |
| **Precision** | Draw 1, Keep 1 | "What country are you in?" |
| **Photos** | Draw 1, Keep 1 | "What terrain type surrounds your station?" |

Each answer is auto-evaluated by the game engine and visualized as a constraint overlay on the map.

### Seeker Timetable Forensics
After the hiding phase ends, seekers gain access to the **past timetable** - all train departures that occurred during the 4-hour head start. This lets them deduce possible routes the hider may have taken, narrowing down the search area before asking any questions. This is a key strategic tool.

---

## Core Mechanic: Seeker Consensus

This is what makes the game unique. The two seekers are a **team that must agree** on every action.

### How It Works

```
SEEKER TURN:
1. PROPOSE  → Each seeker proposes an action (question, travel, wait)
2. DISCUSS  → Seekers exchange messages debating the best move
3. AGREE    → If both propose the same action (or one yields), action executes
4. REPEAT   → If they disagree after discussion, another round of proposals
5. DEADLOCK → After max discussion rounds, dominance score breaks the tie
```

### The Dominance Skill

At game start, each player receives a **secret dominance score** (1-10, randomized). This affects seeker negotiations:

- **High dominance (7-10)**: Player is assertive. Will insist on their choice for more discussion rounds before yielding. The AI will argue more forcefully.
- **Medium dominance (4-6)**: Balanced. Will compromise after 1-2 rounds of disagreement.
- **Low dominance (1-3)**: Agreeable. Will quickly defer to the other seeker's preference.

**Tie-breaking**: If seekers can't agree after 3 discussion rounds, the player with higher dominance score gets their way. If equal, random coin flip.

**For the human player**: Your dominance score is secret to you too - you discover it through play. The UI might show subtle hints ("You feel strongly about this" or "You're inclined to go along"). When you disagree with the AI seeker, the game encourages you to roleplay your dominance level, but mechanically, after max discussion rounds, dominance breaks the tie.

**For AI agents**: The dominance score is injected into their system prompt as a personality trait: "You are quite assertive and tend to push for your preferred strategy" (high) vs. "You generally defer to your partner unless you feel strongly" (low). This naturally shapes their negotiation behavior through prompting.

### Consensus Scenarios

**Human + AI seeking:**
- Human proposes action via UI
- AI proposes action via tool call
- If same → execute immediately
- If different → chat discussion opens. AI explains its reasoning. Human can agree, counter-propose, or argue.
- After discussion, both re-propose. Process repeats up to 3 rounds.
- Deadlock → dominance decides.

**AI + AI seeking (human is hider):**
- Both AIs propose actions
- They discuss via messages (visible to human in chat panel - entertaining to watch!)
- Consensus follows same rules
- Human watches the AI negotiation play out

---

## Architecture: MCP-Based Game Server

The game engine is implemented as an **MCP (Model Context Protocol) tool server**. All 3 players (human + 2 AI) are MCP clients. This gives us a standard, auditable interface where all players use the exact same tool definitions.

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP GAME SERVER                            │
│              (source of truth, runs in browser)              │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │        MCP Tool Registry                          │       │
│  │  Tools defined with JSON Schema (input_schema)    │       │
│  │  Same schemas sent to AI models as native tools   │       │
│  │  Same schemas drive the human UI controls         │       │
│  └──────────────────────────────────────────────────┘       │
│                          │                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Client 1   │  │  Client 2   │  │  Client 3   │         │
│  │  (Human)    │  │  (LLM A)    │  │  (LLM B)    │         │
│  │             │  │             │  │             │          │
│  │ React UI    │  │ Anthropic/  │  │ OpenAI/     │          │
│  │ maps clicks │  │ Gemini API  │  │ Gemini API  │          │
│  │ → MCP calls │  │ w/ MCP tools│  │ w/ MCP tools│          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌──────────────────────────────────────────────────┐       │
│  │        State Filter (per-session, by role)        │       │
│  │  Each client gets role-filtered tool list:        │       │
│  │  Seeker → seeker tools (no hider position)        │       │
│  │  Hider  → hider tools (sees seeker positions)     │       │
│  └──────────────────────────────────────────────────┘       │
│                          │                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │        Action Validator                           │       │
│  │  Validates every MCP tool call before execution   │       │
│  └──────────────────────────────────────────────────┘       │
│                          │                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │        Debug Logger                               │       │
│  │  Logs every tool call + result to communications  │       │
│  └──────────────────────────────────────────────────┘       │
│                          │                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │        Game Engine (schedule, delays, cards, etc) │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Why MCP?
- **Single tool definition**: Define each game tool once as an MCP tool with JSON Schema. The same definition drives the human UI, is sent to Claude as Anthropic tools, to GPT as OpenAI functions, and to Gemini as function declarations.
- **Anti-cheat by design**: The MCP server controls what tools each session can see. Seekers literally cannot call hider-only tools.
- **Auditable**: Every tool call goes through the MCP server and is logged. The debug panel shows the exact MCP requests/responses.
- **Provider-agnostic**: MCP tool schemas translate cleanly to all LLM providers' native tool formats.

### MCP Tool Definition Format
Each game tool is defined once:
```typescript
const tools: MCPTool[] = [
  {
    name: "get_schedule",
    description: "Get train departures from a station",
    input_schema: {
      type: "object",
      properties: {
        station_id: { type: "string", description: "Station to query" },
        from_time: { type: "number", description: "Start time (game minutes)" },
        to_time: { type: "number", description: "End time (game minutes)" }
      },
      required: ["station_id"]
    },
    // Role access control
    roles: ["seeker", "hider"]
  },
  {
    name: "get_past_departures",
    // ... same format
    roles: ["seeker"]  // SEEKER ONLY - hider cannot call this
  },
  {
    name: "set_time_speed",
    // ... same format
    roles: ["hider"]   // HIDER ONLY
  }
]
```

The MCP server filters the tool list per client based on their role, then:
- **For AI clients**: Translates to the model's native format (Anthropic `tools[]`, OpenAI `functions[]`, etc.)
- **For human client**: The React UI auto-generates controls from the tool schemas

### MCP Tools (same for human + AI, filtered by role)

**When acting as SEEKER:**
```
get_visible_state()         → Current station (shared), coins (shared pool),
                              all constraints/question log, hand info (count only),
                              delay alerts. NO hider position.

propose_action(action)      → Propose: ask_question | travel | wait
                              Enters consensus flow with partner.

send_message(text)          → Message to seeker partner (discussion).
                              Max 500 chars.

agree()                     → Accept partner's proposal.

counter_propose(action)     → Reject partner's proposal, suggest alternative.

get_schedule(station_id?, time_range?)
                            → Departures from a station. Can query:
                              - Current departures (default)
                              - Future departures at any station (for route planning)
                              - Returns: train ID, destination, scheduled time,
                                actual time (with delays), status, cost, platform.

get_past_departures(station_id, from_time, to_time)
                            → SEEKER ONLY. View historical departures during the
                              hiding phase. For deducing hider's route.
                              Returns all trains that departed in the time window.

get_station_info(station_id)→ Public info: name, country, connections,
                              operators, coordinates.

get_connections(station_id) → All direct connections from a station with
                              travel times and next departures.

plan_route(from, to)        → Suggests optimal route (Dijkstra) considering
                              current schedule and delays. Returns legs with
                              departure times, changes, total duration, total cost.

list_questions(category?)   → Available questions with cooldown status.
```

**When acting as HIDER:**
```
get_visible_state()         → Own position, hand (cards held), seeker positions
                              (visible!), question log, delay alerts.

travel(destination_id)      → Travel to a connected station. Head start only.

settle_here()               → Establish hiding zone at current station.

play_card(card_id, target?) → Play a card from hand (curse, power-up).
                              Target required for curses.

set_time_speed(multiplier)  → HIDER ONLY during hiding phase.
                              1x (normal), 2x, or 4x speed.

send_message(text)          → Taunt seekers (optional fun).

get_schedule(station_id?, time_range?)
                            → Same as seeker version. For route planning.

get_connections(station_id) → All direct connections from a station.

plan_route(from, to)        → Same as seeker version.

wait()                      → Do nothing.
```

**For the human player**, the UI maps to these tools:
- Clicking a station on the map → `propose_action({type: 'travel', destination: stationId})`
- Clicking "Ask Question" → opens dialog → `propose_action({type: 'ask_question', ...})`
- Typing in chat → `send_message(text)`
- Clicking "Agree" button → `agree()`
- The departure board → visual rendering of `get_schedule()` result
- The route planner → visual rendering of `plan_route()` result
- The history tab → visual rendering of `get_past_departures()` result
- Speed slider (hider only) → `set_time_speed()`

---

## Weather, Delays & Accidents System (M5 — Implemented)

### Weather Zones
Dynamic circular weather zones drift across Europe, grow/shrink, and upgrade over their lifetime:

| Property | Range | Notes |
|----------|-------|-------|
| **Radius** | 50–200 km | Grows or shrinks per `growthRateKmPerHour` (-20 to +30) |
| **Lifetime** | 60–360 game minutes | Removed on expiry or when radius ≤ 0 |
| **Wind drift** | 5–30 km/h | Moves zone center each tick |
| **Upgrade** | cloudy → rain → storm | At 33% age → rain, at 66% age → storm |
| **Spawn rate** | ~1 per 120–240 min | Seeded RNG, max 8 active zones |
| **Initial zones** | 2–3 at game start | For immediate visual interest |

Weather type at any point = worst overlapping zone (haversine point-in-circle check).

### Delay System
Per-tick probability rolling for each active train, based on weather at the train's position:

| Weather | Delay prob/min | Notes |
|---------|---------------|-------|
| Clear | 0.05% | Rare delays |
| Cloudy | 0.1% | Slightly more common |
| Rain | 0.3% | Noticeable impact |
| Storm | 0.8% | Frequent delays |

**Operator bias**: Some train companies are more delay-prone than others:
- **Worst**: DB (2.5×), DB Regio (2.2×), S-Bahn (1.8×), PKP Regio (1.9×)
- **Average**: Trenitalia (1.6×), MÁV (1.7×), SNCF (1.4×), ČD (1.5×)
- **Best**: SBB (0.6×), NS (0.8×), DSB (0.9×), ÖBB (0.9×)

**Escalation lifecycle** (checked every 15–30 game minutes):
- 60% delay doubles (capped at 120 min)
- 30% stays the same (reschedule check)
- 10% resolves early
- Max 3 escalation rounds, then auto-resolve

**Departure board integration**: `getUpcomingDeparturesWithDelays()` adds `delayMinutes` and `status` ('on-time' | 'delayed' | 'cancelled') to each departure.

### Accident System
Much rarer than delays (~10× less likely):

| Weather | Accident prob/min |
|---------|------------------|
| Clear | 0.005% |
| Cloudy | 0.01% |
| Rain | 0.03% |
| Storm | 0.1% |

- Train stops for 120–360 game minutes
- **Fatal chance**: 5% base, 10% in rain/storm
- Fatal accident on player's train → `gameResult = 'fatal_accident'`, game over
- Fatal accident on seeker's train → `gameResult = 'seeker_killed'`, hider wins

### Player Transit Integration
- Delays shift `nextArrivalTime` and `arrivalTime` dynamically each tick
- Accidents set `accidentStalled = true`, freeze position
- Train instance ID derived from transit: `"{routeId}:{dir}:{originDep}"`
- AI seekers see disruption data via stateFilter but cannot predict escalation

### Map Visualization
- **Weather overlay**: GeoJSON fill+line circles, color-coded (gray/blue-gray/purple for cloudy/rain/storm)
- **Smoke renderer**: Blurred gray circles at accident positions with pulsing opacity
- **Train icons**: Delayed trains show in departure board; accident trains frozen on map

### Files
- `src/types/disruptions.ts` — WeatherZone, TrainDelay, TrainAccident types
- `src/engine/weather.ts` — Zone lifecycle: tick, spawn, drift, upgrade, getWeatherAt
- `src/engine/disruptions.ts` — Delay/accident rolling, escalation, operator bias
- `src/map/weatherLayer.ts` — GeoJSON weather zone rendering
- `src/map/smokeRenderer.ts` — Accident smoke effect rendering

---

## Debug Communications Log

All interactions between clients and the game engine are logged to a structured debug log, viewable in a dedicated panel in the UI.

### What Gets Logged
- Every tool call from every client (human + AI), with timestamp, player ID, tool name, parameters, and result
- Every LLM API request/response (system prompt, tools sent, tool call received)
- Every message between seekers
- Every game engine event (phase transition, delay event, card draw, consensus result)
- Every state filter output (what was sent to each client - for anti-cheat auditing)

### Log Format
```typescript
interface LogEntry {
  timestamp: number;        // game time
  realTime: number;         // wall clock ms
  playerId: PlayerId;
  type: 'tool_call' | 'tool_result' | 'llm_request' | 'llm_response' |
        'message' | 'game_event' | 'state_filter';
  data: Record<string, unknown>;
}
```

### UI
- **DebugPanel component**: Collapsible panel (bottom or right side), filterable by player/type
- Shows log entries in real-time as the game progresses
- Can filter: "Show only Claude's calls", "Show only game events", etc.
- Exportable as JSON for post-game analysis

File: `src/engine/logger.ts`, `src/components/DebugPanel.tsx`

---

## Train Schedule Engine (First-Class Feature)

The schedule engine is a core gameplay tool, not just a background system. Players need to plan routes by browsing schedules, checking connections, and accounting for delays - just like real travelers.

### Schedule Data Model

```typescript
interface TrainService {
  id: string;                   // "TGV-6231"
  connectionId: string;         // "paris_nord->lille_europe"
  trainNumber: string;          // "TGV 6231" (displayed on board)
  trainType: 'highspeed' | 'intercity' | 'regional';
  operator: string;             // "SNCF", "DB", "SBB", etc.
  departurePattern: {
    firstDeparture: number;     // minutes after midnight
    lastDeparture: number;
    frequencyMinutes: number;
  };
  durationMinutes: number;
  costCoins: number;
}

interface ScheduledDeparture {
  serviceId: string;
  trainNumber: string;          // "ICE 578"
  destination: StationId;
  destinationName: string;
  scheduledDeparture: number;   // game-time minutes
  actualDeparture: number;      // may differ due to delays
  scheduledArrival: number;
  actualArrival: number;
  status: 'scheduled' | 'on_time' | 'delayed' | 'cancelled';
  delayMinutes: number;
  platform: string;             // "3A" - for flavor
  operator: string;
  trainType: string;
  costCoins: number;
}
```

### Schedule Querying API (exposed as player tools)

```typescript
interface ScheduleEngine {
  getDepartures(stationId, fromTime, toTime): ScheduledDeparture[];
  getArrivals(stationId, fromTime, toTime): ScheduledDeparture[];
  getPastDepartures(stationId, fromTime, toTime): ScheduledDeparture[];  // seekers only
  planRoute(from, to, departAfter): RoutePlan;
  getConnections(stationId): Connection[];
}

interface RoutePlan {
  legs: RouteLeg[];       // each leg = one train
  totalDuration: number;
  totalCost: number;
  transfers: number;
}
```

### Train Types

| Type | Speed | Frequency | Cost/min | Examples |
|------|-------|-----------|----------|---------|
| **High-speed** | 250 km/h | Every 30-60 min | 25 coins | TGV, ICE, Eurostar, Thalys |
| **Intercity** | 160 km/h | Every 1-2 hours | 10 coins | IC, EC trains |
| **Regional** | 80 km/h | Every 30-60 min | 5 coins | RE, RB, TER |

### Schedule Rules
- Trains run ~6:00 to ~23:00 (no overnight)
- Major hubs have more frequent service
- Rural connections: 2-4 trains/day
- Each train gets a realistic number (e.g., "TGV 6231", "ICE 578")
- Delays revealed progressively (may worsen closer to departure)

### Departure Board UI (looks like real European station display)
```
┌─────────────────────────────────────────────────┐
│  ZURICH HB                                 🕐 6:42 │
├───────┬──────────────┬────────┬────────┬────────┤
│ Time  │ Destination  │ Train  │ Plat.  │ Status │
├───────┼──────────────┼────────┼────────┼────────┤
│ 6:45  │ Lyon Part-D  │ TGV 21 │  3A   │   ✅    │
│ 6:52  │ Bern         │ IC 832 │  7    │  ⚠ +8  │
│ 7:00  │ Munich HB    │ EC 194 │  12   │   ✅    │
│ 7:15  │ Milan Cen.   │ EC 321 │  5    │   ❌    │
├───────┴──────────────┴────────┴────────┴────────┤
│ [Departures] [Past] [Route Planner] [Connections]│
└─────────────────────────────────────────────────┘
```
- **Past tab** (seekers only): Historical departures during hiding phase for route forensics

### Station & Connection Dataset

Curated static dataset: **47 stations**, **~85 connections** across **10 countries**.

Paris (merged 3 gares) and London (merged 2 stations) are single nodes. Station IDs use short forms: `paris`, `london`, `munich-hbf`, `rome-termini`.

Train types determined by connection distance: express (>300km), regional (100-300km), local (<100km).

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| **Framework** | Vite + React + TypeScript | Fast dev, type safety, client-side SPA |
| **Map** | Mapbox GL JS v3 + Turf.js | Map rendering + spatial math |
| **State** | Zustand | Lightweight, direct mutation from game loop |
| **Styling** | Tailwind CSS | Rapid UI composition |
| **LLM calls** | Direct API calls (fetch) | Each model's native tool-use API |
| **Testing** | Vitest | Unit tests for game logic, anti-cheat |

**No backend** - runs entirely client-side. API keys stored in localStorage.

---

## Project Structure

```
jetlag/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.example              # VITE_MAPBOX_TOKEN
├── .gitignore
│
├── src/
│   ├── main.tsx
│   ├── App.tsx               # Phase router
│   ├── index.css
│   │
│   ├── types/
│   │   ├── game.ts           # Player, Station, Connection, GamePhase, TransitState
│   │   ├── disruptions.ts    # WeatherZone, TrainDelay, TrainAccident types (M5)
│   │   ├── questions.ts      # QuestionTemplate, QuestionAnswer, Constraint
│   │   ├── schedule.ts       # TrainService, Departure, DelayEvent
│   │   ├── cards.ts          # Card, HiderDeck, CardEffect types
│   │   └── mcp.ts            # MCPTool, MCPToolCall, MCPSession types
│   │
│   ├── store/
│   │   ├── gameStore.ts      # Zustand: full game state + actions
│   │   └── selectors.ts      # Derived state
│   │
│   ├── engine/
│   │   ├── gameLoop.ts       # requestAnimationFrame clock (variable speed)
│   │   ├── stateMachine.ts   # Phase transitions
│   │   ├── pathfinding.ts    # Dijkstra on train network
│   │   ├── trainSchedule.ts  # Train schedule generation (express/regional/local)
│   │   ├── trainRoutes.ts    # Route queries, departures, multi-stop travel
│   │   ├── activeTrains.ts   # Active train position computation (~150-200 trains)
│   │   ├── weather.ts        # Weather zone lifecycle: tick, spawn, drift (M5)
│   │   ├── disruptions.ts    # Delay/accident rolling, escalation, operator bias (M5)
│   │   ├── consensus.ts      # Seeker consensus flow + dominance tiebreak
│   │   ├── consensusLoop.ts  # Consensus orchestration loop
│   │   ├── coinSystem.ts     # Coin budget for questions (radar=1, relative=2, precision=3)
│   │   ├── seeking.ts        # Seeker AI orchestration
│   │   ├── geo.ts            # Haversine distance, geo utilities
│   │   ├── constraints.ts    # Question → map constraint polygons
│   │   ├── hiderDeck.ts      # Card deck: draw, hand management, play cards
│   │   ├── logger.ts         # Debug communications log (all tool calls + events)
│   │   └── scoring.ts        # Score tracking, win conditions
│   │
│   ├── mcp/
│   │   ├── gameServer.ts     # MCP game server: tool registry, dispatch, sessions
│   │   ├── toolDefinitions.ts # All game tools defined as MCP tools w/ JSON schemas
│   │   ├── toolHandlers.ts   # Tool execution handlers (one per tool)
│   │   ├── stateFilter.ts    # Filter tools + state by role (anti-cheat)
│   │   ├── actionValidator.ts # Validate tool calls before execution
│   │   └── sessionManager.ts # Per-player sessions with role-based tool access
│   │
│   ├── client/
│   │   ├── aiClient.ts       # Orchestrates LLM API call with tools
│   │   ├── systemPrompts.ts  # Role-specific prompts (includes disruption awareness)
│   │   ├── claudeProvider.ts # Anthropic API adapter (Claude Sonnet)
│   │   ├── openaiProvider.ts # OpenAI API adapter (GPT-4o)
│   │   └── providerAdapter.ts # Normalized conversation format, converted at boundary
│   │
│   ├── questions/
│   │   ├── questionPool.ts   # All question definitions
│   │   ├── evaluators.ts     # Auto-evaluate answers from geo data
│   │   └── constraintGen.ts  # Generate map overlays from answers
│   │
│   ├── map/
│   │   ├── GameMap.tsx        # Mapbox GL JS component (stations, trains, weather, smoke)
│   │   ├── trainRenderer.ts  # Moving train icons (canvas-drawn, Mapbox symbol layer)
│   │   ├── constraintRenderer.ts # Question constraint overlays
│   │   ├── weatherLayer.ts   # GeoJSON weather zone rendering (M5)
│   │   └── smokeRenderer.ts  # Accident smoke effect rendering (M5)
│   │
│   ├── components/
│   │   ├── Header.tsx         # Round, phase, clock, speed control
│   │   ├── Sidebar.tsx        # Departure board, station info, connections
│   │   ├── SetupScreen.tsx    # Model selection, API keys, game settings
│   │   ├── QuestionLog.tsx    # History of questions + answers + constraints
│   │   ├── DebugPanel.tsx     # Communications log viewer
│   │   ├── RoundEndScreen.tsx # Game over variants (seeker wins, hider wins, fatal accident, seeker killed)
│   │   └── TransitIndicator.tsx # Current trip display (delay/accident banners)
│   │
│   ├── data/
│   │   ├── stations.json      # 47 European stations with metadata
│   │   ├── connections.json   # ~85 connections with distances
│   │   └── graph.ts           # Network graph, adjacency, station lookup
│   │
│   └── utils/
│       ├── geo.ts             # Turf.js wrappers
│       ├── format.ts          # Time/distance formatting
│       └── random.ts          # Seeded random for reproducibility
│
└── tests/
    ├── engine/
    │   ├── consensus.test.ts      # Consensus flow + dominance tiebreak
    │   ├── delayEngine.test.ts    # Delay distribution + cascading
    │   ├── scheduler.test.ts      # Schedule generation, route planning
    │   └── hiderDeck.test.ts      # Card draw, hand management
    ├── mcp/
    │   ├── stateFilter.test.ts    # Verify no info leaks per role
    │   ├── actionValidator.test.ts # Verify illegal actions rejected
    │   └── toolAccess.test.ts     # Verify role-based tool filtering
    └── questions/
        └── evaluators.test.ts
```

---

## UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Round 2/3 │ SEEKING │ ⏱ 6:42 │ Speed: ×60 │ ⚠ Weather NW │ ⏸ │
├─────────────────┬────────────────────────────────────────────┤
│                 │                                            │
│  SEEKER TEAM    │            MAP (Mapbox GL JS)              │
│  📍 Zurich HB   │                                            │
│  💰 340 coins   │  - Train lines (gray, red if delayed)     │
│                 │  - Constraint overlays (green/red)         │
│  👤 You (7/10)  │  - Seeker marker at shared station         │
│  🤖 Claude (3/10)│  - Station dots (clickable to propose)   │
│                 │                                            │
│  🤖 GPT-4o      │                                            │
│  HIDER 🙈       │                                            │
│                 │                                            │
│ ── Consensus ── │                                            │
│ You proposed:   │                                            │
│  "Ask: within   │                                            │
│   200km?"       │                                            │
│ Claude proposed: │                                            │
│  "Travel to     │                                            │
│   Bern"         │                                            │
│ [Agree w/Claude]│                                            │
│ [Insist]        │                                            │
│                 │                                            │
│ ── Chat ─────── │                                            │
│ You: "Let's ask │                                            │
│ a radar first"  │                                            │
│ Claude: "I think│                                            │
│ we should move  │                                            │
│ south based on  │                                            │
│ the last answer"│                                            │
│                 │                                            │
│ ── Departures ──│                                            │
│ 6:45 → Lyon ✅  │                                            │
│ 7:00 → Bern ⚠+8│                                            │
│ 7:15 → Milan ❌ │                                            │
│                 │                                            │
│ ── Q Log ────── │                                            │
│ ❓ North of     │                                            │
│   Zurich? YES   │                                            │
├─────────────────┴────────────────────────────────────────────┤
│ Cooldowns: Relative 🔴12m │ Radar ✅ │ Photos ✅ │ Oddball ✅ │
└──────────────────────────────────────────────────────────────┘
```

Key UI elements for new mechanics:
- **ConsensusPanel**: Shows both proposals side by side. "Agree" / "Insist" / "Counter-propose" buttons.
- **DepartureBoard**: Shows delay status per train (✅ on time, ⚠ delayed +N min, ❌ cancelled)
- **DelayAlert**: Toast banner for weather events / strikes
- **Dominance hints**: Subtle display (e.g., "7/10" dominance shown to player after first round)

---

## Implementation Phases

### M1: Static Board (Complete)
- Vite + React + TS + Tailwind CSS 4 setup
- Type definitions, station/connection data (47 stations, ~85 connections, 10 countries)
- Mapbox GL JS map with station markers, connection lines, pathfinding (Dijkstra)

### M2: Human Hides (Complete)
- Game clock with variable speed (1sec=0.5min base, hider can 2x/4x during hiding)
- State machine: setup → hiding → seeking → round_end
- Travel system, settling, hiding zone (0.8km radius)

### M3: AI Seeks (Complete)
- Claude tool-use AI seeker (Anthropic API, direct browser fetch)
- Question system with auto-evaluation, constraint overlays
- Win/lose conditions, round end screen

### M4: Train Schedules & Dual Seekers (Complete)
- Train schedule engine: express (>300km, 120min freq, 250km/h), regional (100-300km, 60min, 150km/h), local (<100km, 30min, 80km/h)
- Moving train visualization (~150-200 active trains, Mapbox symbol layer)
- Dual AI seekers: Claude (Sonnet) + OpenAI (GPT-4o) with provider adapter pattern
- Consensus engine: proposal → agreement → discussion → tiebreaker
- Coin system: radar=1, relative=2, precision=3, starting budget=10

### M5: Weather, Delays & Accidents (Complete)
- Dynamic weather zones (cloudy → rain → storm), drifting, growing/shrinking
- Per-train delay rolling based on weather + operator bias (DB worst, SBB best)
- Delay escalation lifecycle (60% double / 30% same / 10% resolve, max 3 rounds)
- Rare accidents with fatal chance (5-10%) → game over variants
- Weather overlay + accident smoke on map
- Departure board integration with delay/cancelled status
- Transit indicator shows delay/accident banners
- AI seekers see disruptions via stateFilter (no escalation info)

### Future: Cards & Extended Features
- Card-draw system (hider draws cards when answering questions — see CARDS.md)
- MCP tool server architecture (formal tool registry, sessions, action validator)
- Past timetable forensics for seekers
- Additional question categories (Thermometer, Tentacles)
- Multi-round game (3 rounds, rotate hider)

---

## Verification Plan

1. **Unit tests**: 195 passing tests (Vitest) covering pathfinding, schedule engine, state filter, consensus, coin system, weather, disruptions
2. **Anti-cheat tests**: State filter ensures seekers never receive hider position. Disruption info exposed without escalation details.
3. **Weather tests**: Zone tick, spawn, drift, expiry, getWeatherAt point-in-circle
4. **Disruption tests**: Delay creation, escalation lifecycle, operator bias, accident creation, fatal check
5. **Cross-model test**: Claude (Sonnet) + OpenAI (GPT-4o) dual seeker consensus verified working
6. **Visual verification**: Weather overlay renders, smoke appears on accidents, departure board shows delays, transit indicator shows delay/accident banners
7. **TypeScript**: Zero type errors across entire codebase
