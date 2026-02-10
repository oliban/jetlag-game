import type { WeatherType, WeatherZone, TrainDelay, TrainAccident } from '../types/disruptions';
import { getWeatherAt, getWeatherOverlapCount } from './weather';
import { logger } from './logger';

export interface DisruptionTickParams {
  activeTrainIds: string[];
  getTrainPosition: (id: string) => {
    lat: number;
    lng: number;
    fromStationId?: string;
    toStationId?: string;
    progress?: number;
  } | null;
  weatherZones: WeatherZone[];
  delays: Map<string, TrainDelay>;
  accidents: Map<string, TrainAccident>;
  gameMinutes: number;
  deltaMinutes: number;
  rng: { random: () => number; randInt: (min: number, max: number) => number };
  /** Operator name per train instance ID — used for delay bias */
  getTrainOperator?: (id: string) => string | null;
}

export interface DisruptionTickResult {
  delays: Map<string, TrainDelay>;
  accidents: Map<string, TrainAccident>;
  newAccidents: TrainAccident[];
  newDelays: TrainDelay[];
}

const DELAY_PROBABILITY: Record<WeatherType, number> = {
  clear: 0.0005,
  cloudy: 0.001,
  rain: 0.003,
  storm: 0.008,
};

const ACCIDENT_PROBABILITY: Record<WeatherType, number> = {
  clear: 0.00005,
  cloudy: 0.0001,
  rain: 0.0003,
  storm: 0.001,
};

const MAX_DELAY_MINUTES = 120;
const RESOLVED_DELAY_CLEANUP_MINUTES = 60;

/** Operator-specific delay multipliers — some operators are notoriously unreliable */
const OPERATOR_DELAY_MULTIPLIER: Record<string, number> = {
  'DB':           2.5,   // Deutsche Bahn — famously unreliable
  'DB Regio':     2.2,
  'S-Bahn':       1.8,
  'SNCF':         1.4,
  'SNCF TER':     1.5,
  'Transilien':   1.3,
  'Trenitalia':   1.6,
  'Trenord':      1.7,
  'Renfe':        1.3,
  'PKP':          1.8,
  'PKP Regio':    1.9,
  'MÁV':          1.7,
  'ČD':           1.5,
  // Reliable operators
  'SBB':          0.6,
  'NS':           0.8,
  'NS Sprinter':  0.8,
  'DSB':          0.9,
  'ÖBB':          0.9,
};

/**
 * Process one game tick for the disruption system.
 * Rolls for new delays/accidents, escalates existing delays, and cleans up resolved ones.
 */
export function tickDisruptions(params: DisruptionTickParams): DisruptionTickResult {
  const {
    activeTrainIds,
    getTrainPosition,
    weatherZones,
    gameMinutes,
    deltaMinutes,
    rng,
  } = params;

  const delays = new Map(params.delays);
  const accidents = new Map(params.accidents);
  const newAccidents: TrainAccident[] = [];
  const newDelays: TrainDelay[] = [];

  // --- Per-train rolling ---
  for (const trainId of activeTrainIds) {
    const pos = getTrainPosition(trainId);
    if (!pos) continue;

    const weather = getWeatherAt(weatherZones, pos.lat, pos.lng);
    const overlapCount = getWeatherOverlapCount(weatherZones, pos.lat, pos.lng);
    const overlapMultiplier = overlapCount >= 1 ? 3 ** (overlapCount - 1) : 1;
    const hasAccident = accidents.has(trainId);

    // Delay rolling (skip if train already has an accident)
    if (!hasAccident && !delays.has(trainId)) {
      const operator = params.getTrainOperator?.(trainId) ?? null;
      const opMultiplier = operator ? (OPERATOR_DELAY_MULTIPLIER[operator] ?? 1.0) : 1.0;
      const delayProb = DELAY_PROBABILITY[weather] * deltaMinutes * opMultiplier * overlapMultiplier;
      if (rng.random() < delayProb) {
        const delayMin = rng.randInt(1, 30);
        const nextEsc = gameMinutes + rng.randInt(15, 30);
        const newDelay: TrainDelay = {
          trainInstanceId: trainId,
          delayMinutes: delayMin,
          originalDelayMinutes: delayMin,
          escalationCount: 0,
          createdAt: gameMinutes,
          nextEscalationAt: nextEsc,
          resolved: false,
        };
        delays.set(trainId, newDelay);
        newDelays.push(newDelay);
        logger.info('disruptions', `NEW DELAY: ${trainId} +${delayMin}min (weather=${weather}, operator=${operator ?? 'unknown'}${overlapCount > 1 ? `, overlap=${overlapCount}, mult=${overlapMultiplier}x` : ''})`);
      }
    }

    // Accident rolling (skip if train already has an accident)
    if (!hasAccident) {
      const accidentProb = ACCIDENT_PROBABILITY[weather] * deltaMinutes * overlapMultiplier;
      if (rng.random() < accidentProb) {
        const stoppageDuration = rng.randInt(120, 360);
        const fatalChance = weather === 'rain' || weather === 'storm' ? 0.10 : 0.05;
        const isFatal = rng.random() < fatalChance;

        const accident: TrainAccident = {
          trainInstanceId: trainId,
          stoppedAtLat: pos.lat,
          stoppedAtLng: pos.lng,
          segmentFromStationId: pos.fromStationId ?? '',
          segmentToStationId: pos.toStationId ?? '',
          progress: pos.progress ?? 0,
          createdAt: gameMinutes,
          resumeAt: gameMinutes + stoppageDuration,
          isFatal,
        };

        accidents.set(trainId, accident);
        newAccidents.push(accident);
        logger.warn('disruptions', `ACCIDENT: ${trainId} on ${pos.fromStationId}→${pos.toStationId} (stopped ${stoppageDuration}min, fatal=${isFatal}, weather=${weather}${overlapCount > 1 ? `, overlap=${overlapCount}, mult=${overlapMultiplier}x` : ''})`);
      }
    }
  }

  // --- Delay escalation ---
  for (const [trainId, delay] of delays) {
    if (delay.resolved) continue;
    if (gameMinutes < delay.nextEscalationAt) continue;

    if (delay.escalationCount >= 3) {
      delays.set(trainId, { ...delay, resolved: true });
      logger.info('disruptions', `DELAY RESOLVED (max escalations): ${trainId} was +${delay.delayMinutes}min`);
      continue;
    }

    const roll = rng.random();
    if (roll < 0.1) {
      // Resolve
      delays.set(trainId, { ...delay, resolved: true });
      logger.info('disruptions', `DELAY RESOLVED (early): ${trainId} was +${delay.delayMinutes}min`);
    } else if (roll < 0.4) {
      // Stays the same, reschedule
      delays.set(trainId, {
        ...delay,
        nextEscalationAt: gameMinutes + rng.randInt(15, 30),
      });
      logger.debug('disruptions', `DELAY HOLDS: ${trainId} stays +${delay.delayMinutes}min (esc ${delay.escalationCount}/3)`);
    } else {
      // Doubles (capped at MAX_DELAY_MINUTES)
      const newDelay = Math.min(delay.delayMinutes * 2, MAX_DELAY_MINUTES);
      delays.set(trainId, {
        ...delay,
        delayMinutes: newDelay,
        escalationCount: delay.escalationCount + 1,
        nextEscalationAt: gameMinutes + rng.randInt(15, 30),
      });
      logger.info('disruptions', `DELAY ESCALATED: ${trainId} +${delay.delayMinutes}min → +${newDelay}min (esc ${delay.escalationCount + 1}/3)`);
    }
  }

  // --- Cleanup ---
  for (const [trainId, delay] of delays) {
    if (delay.resolved && gameMinutes - delay.createdAt > RESOLVED_DELAY_CLEANUP_MINUTES) {
      delays.delete(trainId);
    }
  }

  for (const [trainId, accident] of accidents) {
    if (gameMinutes >= accident.resumeAt) {
      logger.info('disruptions', `ACCIDENT CLEARED: ${trainId} (was stopped ${Math.round(accident.resumeAt - accident.createdAt)}min)`);
      accidents.delete(trainId);
    }
  }

  return { delays, accidents, newAccidents, newDelays };
}

/**
 * Get the current delay in minutes for a train, or 0 if none.
 */
export function getTrainDelay(
  delays: Map<string, TrainDelay>,
  trainInstanceId: string,
): number {
  const delay = delays.get(trainInstanceId);
  if (!delay || delay.resolved) return 0;
  return delay.delayMinutes;
}

/**
 * Check if a train has an active accident. Returns the accident or null.
 */
export function isTrainAccident(
  accidents: Map<string, TrainAccident>,
  trainInstanceId: string,
): TrainAccident | null {
  return accidents.get(trainInstanceId) ?? null;
}
