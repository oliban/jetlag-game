import { getConnections, getStations, buildAdjacencyList } from '../data/graph';
import type { TrainType } from '../types/game';
import type { TrainDelay, TrainAccident } from '../types/disruptions';
import { getBlockedSegments, isSegmentBlocked } from './segmentBlock';
import { travelDuration, computeDepartureOffset } from './trainSchedule';
import { computeBearing } from './geo';

// Dwell times at intermediate stations (minutes)
const DWELL_TIMES: Record<TrainType, number> = {
  express: 5,
  regional: 3,
  local: 2,
};

const TRAIN_SPEEDS: Record<TrainType, number> = {
  express: 250,
  regional: 150,
  local: 80,
};

const TRAIN_FREQUENCIES: Record<TrainType, number> = {
  express: 120,
  regional: 60,
  local: 30,
};

const MAX_ROUTE_STATIONS: Record<TrainType, number> = {
  express: 8,
  regional: 6,
  local: 4,
};

export interface StopTime {
  stationId: string;
  arrivalMin: number;      // minutes after origin departure (0 for first)
  departureMin: number;    // arrival + dwell (= arrival for origin & terminus)
}

export interface TrainRoute {
  id: string;              // "EXP-1", "REG-5", "LOC-12"
  stations: string[];      // ordered station IDs (forward direction)
  trainType: TrainType;
  speed: number;           // km/h
  frequency: number;       // minutes between departures from origin
  offset: number;          // forward direction offset (hash-based staggering)
  reverseOffset: number;   // reverse direction offset
  dwellTime: number;       // minutes at intermediate stops
  stopTimes: StopTime[];   // forward direction precomputed
  reverseStopTimes: StopTime[]; // reverse direction precomputed
  totalDuration: number;   // full trip, origin to terminus (same both directions)
  operator: string;        // train operating company
}

export interface RouteDeparture {
  route: TrainRoute;
  direction: 'forward' | 'reverse';
  arrivalTime: number;     // game minutes when train arrives at this station
  departureTime: number;   // game minutes when train departs this station
  stationIndex: number;    // index in the direction's stop list
  remainingStops: { stationId: string; arrivalMin: number; departureMin: number }[];
  delayMinutes?: number;
  status?: 'on-time' | 'delayed' | 'cancelled';
}

/** Connection distance lookup key (alphabetically sorted) */
function connKey(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `${x}:${y}`;
}

/** Angle difference in degrees (0-180) */
function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/** Classify route by its longest segment distance */
function classifyByLongestSegment(segmentDistances: number[]): TrainType {
  const longest = Math.max(...segmentDistances);
  if (longest > 300) return 'express';
  if (longest >= 100) return 'regional';
  return 'local';
}

/** Compute stop times for a list of stations at a given speed and dwell */
function buildStopTimes(
  stationIds: string[],
  speed: number,
  dwellTime: number,
  distLookup: Map<string, number>,
): StopTime[] {
  const stops: StopTime[] = [];
  let cumulativeMin = 0;

  for (let i = 0; i < stationIds.length; i++) {
    const arrivalMin = cumulativeMin;
    const isTerminal = i === 0 || i === stationIds.length - 1;
    const departureMin = isTerminal ? arrivalMin : arrivalMin + dwellTime;

    stops.push({ stationId: stationIds[i], arrivalMin, departureMin });

    if (i < stationIds.length - 1) {
      const dist = distLookup.get(connKey(stationIds[i], stationIds[i + 1]))!;
      cumulativeMin = departureMin + travelDuration(dist, speed);
    }
  }

  return stops;
}

/** Determine train operator based on countries the route passes through */
function assignOperator(
  routeStations: string[],
  trainType: TrainType,
  stationsMap: Record<string, { country: string }>,
): string {
  const countries = routeStations.map(id => stationsMap[id]?.country).filter(Boolean);
  const countrySet = new Set(countries);

  // Cross-border express routes get special operators
  if (trainType === 'express' && countrySet.size > 1) {
    if (countrySet.has('United Kingdom')) return 'Eurostar';
    if (countrySet.has('France') && countrySet.has('Belgium')) return 'Thalys';
    if (countrySet.has('France') && countrySet.has('Netherlands')) return 'Thalys';
    if (countrySet.has('France') && countrySet.has('Switzerland')) return 'TGV Lyria';
    if (countrySet.has('France') && countrySet.has('Spain')) return 'Renfe-SNCF';
    if (countrySet.has('Portugal') && countrySet.has('Spain')) return 'Renfe-CP';
    if (countrySet.has('Sweden') && countrySet.has('Norway')) return 'SJ';
    if (countrySet.has('Sweden') && countrySet.has('Denmark')) return 'Oresundstag';
    if (countrySet.has('Serbia') && countrySet.has('Hungary')) return 'MÁV';
    if ((countrySet.has('Slovenia') || countrySet.has('Croatia')) && countrySet.has('Austria')) return 'ÖBB';
    if (countrySet.has('Bulgaria') && countrySet.has('Romania')) return 'CFR';
    if (countrySet.has('Austria') || countrySet.has('Hungary') || countrySet.has('Czech Republic')) return 'ÖBB';
  }

  // Majority country determines operator
  const freq: Record<string, number> = {};
  for (const c of countries) freq[c] = (freq[c] || 0) + 1;
  const majority = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const ops: Record<string, Record<TrainType, string>> = {
    'France':         { express: 'SNCF',        regional: 'SNCF TER',     local: 'Transilien' },
    'Germany':        { express: 'DB',           regional: 'DB Regio',     local: 'S-Bahn' },
    'Italy':          { express: 'Trenitalia',   regional: 'Trenitalia',   local: 'Trenord' },
    'Spain':          { express: 'Renfe',        regional: 'Renfe',        local: 'Cercanías' },
    'United Kingdom': { express: 'LNER',         regional: 'CrossCountry', local: 'Northern' },
    'Netherlands':    { express: 'NS',           regional: 'NS',           local: 'NS Sprinter' },
    'Belgium':        { express: 'SNCB',         regional: 'SNCB',         local: 'SNCB' },
    'Switzerland':    { express: 'SBB',          regional: 'SBB',          local: 'SBB' },
    'Austria':        { express: 'ÖBB',          regional: 'ÖBB',          local: 'ÖBB' },
    'Czech Republic': { express: 'ČD',           regional: 'ČD',           local: 'ČD' },
    'Poland':         { express: 'PKP',          regional: 'PKP',          local: 'PKP Regio' },
    'Hungary':        { express: 'MÁV',          regional: 'MÁV',          local: 'MÁV' },
    'Denmark':        { express: 'DSB',          regional: 'DSB',          local: 'DSB' },
    'Portugal':       { express: 'CP',           regional: 'CP Regional',  local: 'CP Urbanos' },
    'Sweden':         { express: 'SJ',           regional: 'SJ Regional',  local: 'SL' },
    'Norway':         { express: 'Vy',           regional: 'Vy',           local: 'Vy' },
    'Bulgaria':       { express: 'BDZ',          regional: 'BDZ',          local: 'BDZ' },
    'Croatia':        { express: 'HZ',           regional: 'HZ',           local: 'HZ' },
    'Greece':         { express: 'Hellenic Train', regional: 'Hellenic Train', local: 'Proastiakos' },
    'Romania':        { express: 'CFR',          regional: 'CFR',          local: 'CFR Regio' },
    'Serbia':         { express: 'SZ',           regional: 'SZ',           local: 'BG Voz' },
    'Slovenia':       { express: 'SZ',           regional: 'SZ',           local: 'SZ' },
    'North Macedonia': { express: 'MZ',          regional: 'MZ',           local: 'MZ' },
    'Slovakia':       { express: 'ZSSK',         regional: 'ZSSK',         local: 'ZSSK' },
    'Luxembourg':     { express: 'CFL',          regional: 'CFL',          local: 'CFL' },
  };

  return ops[majority]?.[trainType] ?? 'EuroRail';
}

/** Greedy corridor extraction — generate multi-stop routes from connection graph */
function generateRoutes(): TrainRoute[] {
  const connections = getConnections();
  const stations = getStations();
  const adj = buildAdjacencyList();

  // Build distance lookup
  const distLookup = new Map<string, number>();
  for (const c of connections) {
    distLookup.set(connKey(c.from, c.to), c.distance);
  }

  // Sort connections by distance (longest first)
  const sortedConns = [...connections].sort((a, b) => b.distance - a.distance);

  // Track covered connections
  const coveredConns = new Set<string>();

  const routes: TrainRoute[] = [];
  const counters: Record<TrainType, number> = { express: 0, regional: 0, local: 0 };

  for (const conn of sortedConns) {
    const key = connKey(conn.from, conn.to);
    if (coveredConns.has(key)) continue;

    // Start a new route with this connection
    const routeStations = [conn.from, conn.to];
    const segmentDistances = [conn.distance];

    // Tentatively classify to determine max stations
    let trainType = classifyByLongestSegment(segmentDistances);
    let maxStations = MAX_ROUTE_STATIONS[trainType];

    // Extend from the front (prepend stations)
    extendRoute(routeStations, segmentDistances, 'front', maxStations, stations, adj, distLookup, coveredConns);
    // Reclassify after front extension
    trainType = classifyByLongestSegment(segmentDistances);
    maxStations = MAX_ROUTE_STATIONS[trainType];

    // Extend from the back (append stations)
    extendRoute(routeStations, segmentDistances, 'back', maxStations, stations, adj, distLookup, coveredConns);

    // Mark all segments as covered
    for (let i = 0; i < routeStations.length - 1; i++) {
      coveredConns.add(connKey(routeStations[i], routeStations[i + 1]));
    }

    // Final classification
    trainType = classifyByLongestSegment(segmentDistances);
    const speed = TRAIN_SPEEDS[trainType];
    const frequency = TRAIN_FREQUENCIES[trainType];
    const dwellTime = DWELL_TIMES[trainType];
    counters[trainType]++;

    const prefix = trainType === 'express' ? 'EXP' : trainType === 'regional' ? 'REG' : 'LOC';
    const id = `${prefix}-${counters[trainType]}`;

    // Compute stop times for both directions
    const stopTimes = buildStopTimes(routeStations, speed, dwellTime, distLookup);
    const reverseStations = [...routeStations].reverse();
    const reverseStopTimes = buildStopTimes(reverseStations, speed, dwellTime, distLookup);

    const totalDuration = stopTimes[stopTimes.length - 1].arrivalMin;

    // Compute offsets for staggering (stagger reverse by half frequency for realism)
    const offset = computeDepartureOffset(routeStations[0], routeStations[routeStations.length - 1]) % frequency;
    const reverseOffset = (offset + Math.floor(frequency / 2)) % frequency;

    routes.push({
      id,
      stations: routeStations,
      trainType,
      speed,
      frequency,
      offset,
      reverseOffset,
      dwellTime,
      stopTimes,
      reverseStopTimes,
      totalDuration,
      operator: assignOperator(routeStations, trainType, stations),
    });
  }

  // Second pass: create local shuttle services for short connections (<100km).
  // These overlap with existing routes (realistic — S-Bahn alongside ICE).
  for (const conn of connections) {
    if (conn.distance >= 100) continue;

    const trainType: TrainType = 'local';
    const speed = TRAIN_SPEEDS[trainType];
    const frequency = TRAIN_FREQUENCIES[trainType];
    const dwellTime = DWELL_TIMES[trainType];
    counters[trainType]++;

    const prefix = 'LOC';
    const id = `${prefix}-${counters[trainType]}`;
    const routeStations = [conn.from, conn.to];

    const stopTimes = buildStopTimes(routeStations, speed, dwellTime, distLookup);
    const reverseStopTimes = buildStopTimes([conn.to, conn.from], speed, dwellTime, distLookup);
    const totalDuration = stopTimes[stopTimes.length - 1].arrivalMin;

    const offset = computeDepartureOffset(conn.from, conn.to) % frequency;
    const reverseOffset = (offset + Math.floor(frequency / 2)) % frequency;

    routes.push({
      id,
      stations: routeStations,
      trainType,
      speed,
      frequency,
      offset,
      reverseOffset,
      dwellTime,
      stopTimes,
      reverseStopTimes,
      totalDuration,
      operator: assignOperator(routeStations, trainType, stations),
    });
  }

  return routes;
}

/** Extend a route from one end by finding aligned neighbors */
function extendRoute(
  routeStations: string[],
  segmentDistances: number[],
  end: 'front' | 'back',
  maxStations: number,
  stations: ReturnType<typeof getStations>,
  adj: ReturnType<typeof buildAdjacencyList>,
  distLookup: Map<string, number>,
  coveredConns: Set<string>,
): void {
  while (routeStations.length < maxStations) {
    const tipStation = end === 'front' ? routeStations[0] : routeStations[routeStations.length - 1];
    const prevStation = end === 'front' ? routeStations[1] : routeStations[routeStations.length - 2];

    const tipSt = stations[tipStation];
    const prevSt = stations[prevStation];
    if (!tipSt || !prevSt) break;

    // Current bearing: from previous toward tip (the direction we're extending)
    const currentBearing = computeBearing(prevSt.lat, prevSt.lng, tipSt.lat, tipSt.lng);

    const candidates = (adj[tipStation] ?? []).filter(n => !routeStations.includes(n.to));
    if (candidates.length === 0) break;

    let bestCandidate: string | null = null;
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const candSt = stations[cand.to];
      if (!candSt) continue;

      const candBearing = computeBearing(tipSt.lat, tipSt.lng, candSt.lat, candSt.lng);
      const alignment = 1 - angleDiff(currentBearing, candBearing) / 180;

      // Must have reasonable alignment (>0.3 means <126 degree turn)
      if (alignment <= 0.3) continue;

      const uncoveredBonus = coveredConns.has(connKey(tipStation, cand.to)) ? 0 : 0.3;
      const avgDist = segmentDistances.reduce((s, d) => s + d, 0) / segmentDistances.length;
      const distSimilarity = 1 - Math.min(1, Math.abs(cand.distance - avgDist) / Math.max(avgDist, 1));

      const score = alignment * 0.5 + uncoveredBonus + distSimilarity * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand.to;
      }
    }

    if (!bestCandidate) break;

    const dist = distLookup.get(connKey(tipStation, bestCandidate))!;
    if (end === 'front') {
      routeStations.unshift(bestCandidate);
      segmentDistances.unshift(dist);
    } else {
      routeStations.push(bestCandidate);
      segmentDistances.push(dist);
    }

    // Reclassify to possibly increase maxStations
    const newType = classifyByLongestSegment(segmentDistances);
    const newMax = MAX_ROUTE_STATIONS[newType];
    if (newMax > maxStations) {
      // Route upgraded — allow more stations
      // (We update the caller's maxStations via the while condition next iteration)
    }
    // Use the potentially larger maxStations
    maxStations = newMax;
  }
}

// --- Cached route list ---

let cachedRoutes: TrainRoute[] | null = null;

/** Get all generated routes (cached) */
export function getRoutes(): TrainRoute[] {
  if (!cachedRoutes) {
    cachedRoutes = generateRoutes();
  }
  return cachedRoutes;
}

/** Get all routes passing through a station */
export function getRoutesAtStation(stationId: string): TrainRoute[] {
  return getRoutes().filter(r => r.stations.includes(stationId));
}

/** Get upcoming departures at a station, sorted by departure time */
export function getUpcomingDepartures(
  stationId: string,
  gameMinutes: number,
  count: number = 10,
): RouteDeparture[] {
  const routes = getRoutesAtStation(stationId);
  const departures: RouteDeparture[] = [];

  for (const route of routes) {
    // Check forward direction
    collectDepartures(route, 'forward', route.stopTimes, route.offset, stationId, gameMinutes, count, departures);
    // Check reverse direction
    collectDepartures(route, 'reverse', route.reverseStopTimes, route.reverseOffset, stationId, gameMinutes, count, departures);
  }

  departures.sort((a, b) => a.departureTime - b.departureTime);
  return departures.slice(0, count);
}

/** Get upcoming departures with delay and accident information */
export function getUpcomingDeparturesWithDelays(
  stationId: string,
  gameMinutes: number,
  count: number,
  delays: Map<string, TrainDelay>,
  accidents: Map<string, TrainAccident>,
): RouteDeparture[] {
  // Get extra departures since some may be cancelled
  const departures = getUpcomingDepartures(stationId, gameMinutes, count * 2);

  // Compute blocked segments once
  const blockedSegments = getBlockedSegments(accidents, gameMinutes);

  const result: RouteDeparture[] = [];

  for (const dep of departures) {
    // Compute train instance ID
    const stopTimes = dep.direction === 'forward' ? dep.route.stopTimes : dep.route.reverseStopTimes;
    const stopDepartureOffset = stopTimes[dep.stationIndex].departureMin;
    const originDep = dep.departureTime - stopDepartureOffset;
    const trainInstanceId = `${dep.route.id}:${dep.direction}:${originDep}`;

    // Check for delay
    const delay = delays.get(trainInstanceId);
    const delayMinutes = delay && !delay.resolved ? delay.delayMinutes : 0;

    // Check for accident on this train
    const accident = accidents.get(trainInstanceId);
    let status: 'on-time' | 'delayed' | 'cancelled' = 'on-time';
    if (accident && gameMinutes < accident.resumeAt) {
      status = 'cancelled';
    } else if (dep.stationIndex < stopTimes.length - 1) {
      // Check if first segment from this station is blocked by another accident
      const nextStopId = stopTimes[dep.stationIndex + 1].stationId;
      if (isSegmentBlocked(blockedSegments, stationId, nextStopId)) {
        status = 'cancelled';
      }
    }

    if (status === 'on-time' && delayMinutes > 0) {
      status = 'delayed';
    }

    result.push({
      ...dep,
      delayMinutes,
      status,
      // Adjust departure time by delay
      departureTime: dep.departureTime + delayMinutes,
      remainingStops: dep.remainingStops.map(s => ({
        ...s,
        arrivalMin: s.arrivalMin + delayMinutes,
        departureMin: s.departureMin + delayMinutes,
      })),
    });

    if (result.length >= count) break;
  }

  return result;
}

/** Collect departures for one direction of a route at a given station */
function collectDepartures(
  route: TrainRoute,
  direction: 'forward' | 'reverse',
  stopTimes: StopTime[],
  dirOffset: number,
  stationId: string,
  gameMinutes: number,
  maxPerDirection: number,
  out: RouteDeparture[],
): void {
  const stationIndex = stopTimes.findIndex(st => st.stationId === stationId);
  if (stationIndex < 0 || stationIndex >= stopTimes.length - 1) return; // not found or terminus

  const stopArrivalOffset = stopTimes[stationIndex].arrivalMin;
  const stopDepartureOffset = stopTimes[stationIndex].departureMin;

  // Find the smallest origin departure such that station departure >= gameMinutes.
  // This catches dwelling trains too (arrived but not yet departed).
  // Station departure = originDep + stopDepartureOffset
  // originDep = dirOffset + n * frequency
  // We need dirOffset + n * frequency + stopDepartureOffset >= gameMinutes
  // => n >= (gameMinutes - stopDepartureOffset - dirOffset) / frequency
  const minN = Math.ceil((gameMinutes - stopDepartureOffset - dirOffset) / route.frequency);
  const startN = minN;

  for (let i = 0; i < maxPerDirection; i++) {
    const n = startN + i;
    const originDep = dirOffset + n * route.frequency;
    const stationArr = originDep + stopArrivalOffset;
    const stationDep = originDep + stopDepartureOffset;

    const remainingStops = stopTimes.slice(stationIndex + 1).map(st => ({
      stationId: st.stationId,
      arrivalMin: originDep + st.arrivalMin,
      departureMin: originDep + st.departureMin,
    }));

    out.push({
      route,
      direction,
      arrivalTime: stationArr,
      departureTime: stationDep,
      stationIndex,
      remainingStops,
    });
  }
}

/** Reset cached routes (for testing) */
export function _resetRouteCache(): void {
  cachedRoutes = null;
}
