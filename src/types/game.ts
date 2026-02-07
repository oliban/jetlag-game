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
