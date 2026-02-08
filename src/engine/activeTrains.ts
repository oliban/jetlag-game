import { getConnections, getStations } from '../data/graph';
import type { StationMap } from '../data/graph';
import type { TrainType } from '../types/game';
import {
  classifyConnection,
  computeDepartureOffset,
  travelDuration,
  TRAIN_CONFIGS,
} from './trainSchedule';

export interface ActiveTrain {
  id: string; // "{fromId}:{toId}:{departureTime}"
  fromId: string;
  toId: string;
  trainType: TrainType;
  departureTime: number;
  arrivalTime: number;
  progress: number; // 0..1
  lng: number;
  lat: number;
  bearing: number; // degrees
}

interface ConnectionSchedule {
  fromId: string;
  toId: string;
  fromLng: number;
  fromLat: number;
  toLng: number;
  toLat: number;
  trainType: TrainType;
  frequency: number;
  travelMins: number;
  offset: number; // effective offset (already modded by frequency)
  bearing: number;
}

/** Geographic bearing in degrees (0 = north, 90 = east) */
export function computeBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

let cachedSchedules: ConnectionSchedule[] | null = null;

/** Build and cache all directional schedules (83 connections x 2 = 166) */
export function buildSchedules(): ConnectionSchedule[] {
  if (cachedSchedules) return cachedSchedules;

  const connections = getConnections();
  const stations: StationMap = getStations();
  const schedules: ConnectionSchedule[] = [];

  for (const conn of connections) {
    const fromStation = stations[conn.from];
    const toStation = stations[conn.to];
    if (!fromStation || !toStation) continue;

    const trainType = classifyConnection(conn.distance);
    const config = TRAIN_CONFIGS[trainType];
    const rawOffset = computeDepartureOffset(conn.from, conn.to);
    const offset = rawOffset % config.frequency;
    const travelMins = travelDuration(conn.distance, config.speed);

    // Forward direction
    schedules.push({
      fromId: conn.from,
      toId: conn.to,
      fromLng: fromStation.lng,
      fromLat: fromStation.lat,
      toLng: toStation.lng,
      toLat: toStation.lat,
      trainType,
      frequency: config.frequency,
      travelMins,
      offset,
      bearing: computeBearing(
        fromStation.lat,
        fromStation.lng,
        toStation.lat,
        toStation.lng,
      ),
    });

    // Reverse direction
    schedules.push({
      fromId: conn.to,
      toId: conn.from,
      fromLng: toStation.lng,
      fromLat: toStation.lat,
      toLng: fromStation.lng,
      toLat: fromStation.lat,
      trainType,
      frequency: config.frequency,
      travelMins,
      offset,
      bearing: computeBearing(
        toStation.lat,
        toStation.lng,
        fromStation.lat,
        fromStation.lng,
      ),
    });
  }

  cachedSchedules = schedules;
  return schedules;
}

/** Get all currently-active trains at a given game time */
export function getActiveTrains(gameMinutes: number): ActiveTrain[] {
  const schedules = buildSchedules();
  const trains: ActiveTrain[] = [];

  for (const sched of schedules) {
    // Find the latest departure index at or before gameMinutes
    // Departures happen at: offset, offset + freq, offset + 2*freq, ...
    if (gameMinutes < sched.offset) continue;

    const nMax = Math.floor((gameMinutes - sched.offset) / sched.frequency);
    // Check backwards — at most ceil(travelMins/frequency) + 1 iterations
    const maxCheck = Math.ceil(sched.travelMins / sched.frequency) + 1;

    for (let i = 0; i < maxCheck; i++) {
      const n = nMax - i;
      if (n < 0) break;

      const dep = sched.offset + n * sched.frequency;
      const arr = dep + sched.travelMins;

      // Train must have departed and not yet arrived
      if (dep > gameMinutes) continue;
      if (arr <= gameMinutes) break; // earlier trains have arrived too

      const progress = (gameMinutes - dep) / sched.travelMins;
      const lng =
        sched.fromLng + (sched.toLng - sched.fromLng) * progress;
      const lat =
        sched.fromLat + (sched.toLat - sched.fromLat) * progress;

      trains.push({
        id: `${sched.fromId}:${sched.toId}:${dep}`,
        fromId: sched.fromId,
        toId: sched.toId,
        trainType: sched.trainType,
        departureTime: dep,
        arrivalTime: arr,
        progress,
        lng,
        lat,
        bearing: sched.bearing,
      });
    }
  }

  return trains;
}

/** Reset cached schedules (for testing) */
export function _resetScheduleCache(): void {
  cachedSchedules = null;
}
