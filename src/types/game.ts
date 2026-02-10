export interface Station {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  /** Number of connections - indicates hub importance */
  connections: number;
}

export interface Connection {
  from: string;
  to: string;
  /** Distance in km */
  distance: number;
}

export type TrainType = 'express' | 'regional' | 'local';

export interface TransitState {
  fromStationId: string;
  toStationId: string;         // immediate next station
  departureTime: number;       // game minutes (original boarding time)
  arrivalTime: number;         // arrival at FINAL destination (game minutes)
  trainType: TrainType;
  /** When the current segment started (departure from fromStationId).
   *  For the first segment this equals departureTime.
   *  Updated each time the train advances to the next segment. */
  segmentDepartureTime: number;
  // Route fields for multi-stop travel:
  routeId?: string;
  routeStations?: string[];    // full route stations in travel direction
  destinationStationId?: string; // player's chosen stop
  nextArrivalTime?: number;    // arrival at immediate next station
  delayMinutes?: number;        // current delay on this train (from disruptions)
  accidentStalled?: boolean;    // train stopped due to accident
  stalledAtGameMinutes?: number; // game time when stall began (for time-shift on recovery)
}

export interface TravelHistoryEntry {
  fromStationId: string;
  toStationId: string;
  departureTime: number;   // game minutes
  arrivalTime: number;     // game minutes
  trainType: TrainType;
}

export type SeekerMode = 'single' | 'consensus';

export type Role = 'hider' | 'seeker';

export type GamePhase =
  | 'setup'
  | 'hiding'
  | 'seeking'
  | 'round_end';

export interface Player {
  id: string;
  name: string;
  role: Role;
  stationId: string;
  isAI: boolean;
}

export interface HidingZone {
  stationId: string;
  lat: number;
  lng: number;
  /** Radius in km */
  radius: number;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  hidingZone: HidingZone | null;
  gameClockMinutes: number;
  speedMultiplier: number;
}
