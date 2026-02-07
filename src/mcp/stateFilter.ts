import type { Role } from '../types/game';
import type { Constraint } from '../engine/constraints';

export interface SeekerViewState {
  phase: string;
  seekerStationId: string;
  seekerStationName: string;
  seekerCountry: string;
  gameMinutes: number;
  constraints: Constraint[];
  /** Seeker does NOT see hider position */
  availableConnections: string[];
  questionsAsked: Array<{ question: string; answer: string }>;
  /** Stations that match ALL current constraints (computed server-side) */
  candidateStations?: string[];
}

export interface HiderViewState {
  phase: string;
  hiderStationId: string;
  hiderStationName: string;
  seekerStationId: string;
  seekerStationName: string;
  gameMinutes: number;
  constraints: Constraint[];
  hidingZoneActive: boolean;
}

export interface FullGameState {
  phase: string;
  hiderStationId: string;
  hiderStationName: string;
  seekerStationId: string;
  seekerStationName: string;
  gameMinutes: number;
  constraints: Constraint[];
  questionsAsked: Array<{ question: string; answer: string }>;
  availableSeekerConnections: string[];
  hidingZoneActive: boolean;
}

/**
 * Filter game state based on role. This is the anti-cheat mechanism.
 * Seekers NEVER see the hider's position.
 */
export function filterStateForRole(
  fullState: FullGameState,
  role: Role,
): SeekerViewState | HiderViewState {
  if (role === 'seeker') {
    return {
      phase: fullState.phase,
      seekerStationId: fullState.seekerStationId,
      seekerStationName: fullState.seekerStationName,
      seekerCountry: '',
      gameMinutes: fullState.gameMinutes,
      constraints: fullState.constraints,
      availableConnections: fullState.availableSeekerConnections,
      questionsAsked: fullState.questionsAsked,
    };
  }

  // Hider can see everything including seeker position
  return {
    phase: fullState.phase,
    hiderStationId: fullState.hiderStationId,
    hiderStationName: fullState.hiderStationName,
    seekerStationId: fullState.seekerStationId,
    seekerStationName: fullState.seekerStationName,
    gameMinutes: fullState.gameMinutes,
    constraints: fullState.constraints,
    hidingZoneActive: fullState.hidingZoneActive,
  };
}
