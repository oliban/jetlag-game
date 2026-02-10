import type { Role } from '../types/game';
import type { Constraint } from '../engine/constraints';
import type { CoinBudget } from '../engine/coinSystem';
import type { WeatherType, WeatherZone, TrainDelay, TrainAccident } from '../types/disruptions';

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
  /** Coin budget for question costs */
  coinBudget?: CoinBudget;
  activeDisruptions?: {
    delays: Array<{ routeId: string; trainId: string; delayMinutes: number }>;
    accidents: Array<{ routeId: string; trainId: string; stoppedUntilGameMinutes: number }>;
  };
  currentWeather?: Array<{ type: WeatherType; centerLat: number; centerLng: number; radiusKm: number }>;
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
  weatherZones?: WeatherZone[];
  delays?: Map<string, TrainDelay>;
  accidents?: Map<string, TrainAccident>;
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
    // Build disruption data for seeker
    const delays: Array<{ routeId: string; trainId: string; delayMinutes: number }> = [];
    if (fullState.delays) {
      for (const [id, delay] of fullState.delays) {
        if (!delay.resolved) {
          const parts = id.split(':');
          delays.push({ routeId: parts[0], trainId: id, delayMinutes: delay.delayMinutes });
        }
      }
    }
    const accidents: Array<{ routeId: string; trainId: string; stoppedUntilGameMinutes: number }> = [];
    if (fullState.accidents) {
      for (const [id, accident] of fullState.accidents) {
        const parts = id.split(':');
        accidents.push({ routeId: parts[0], trainId: id, stoppedUntilGameMinutes: accident.resumeAt });
      }
    }
    const currentWeather = fullState.weatherZones?.map(z => ({
      type: z.weatherType,
      centerLat: z.centerLat,
      centerLng: z.centerLng,
      radiusKm: z.radiusKm,
    }));

    return {
      phase: fullState.phase,
      seekerStationId: fullState.seekerStationId,
      seekerStationName: fullState.seekerStationName,
      seekerCountry: '',
      gameMinutes: fullState.gameMinutes,
      constraints: fullState.constraints,
      availableConnections: fullState.availableSeekerConnections,
      questionsAsked: fullState.questionsAsked,
      activeDisruptions: { delays, accidents },
      currentWeather,
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
