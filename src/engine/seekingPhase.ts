import { haversineDistance } from './geo';

export const SEEKING_TIME_LIMIT = 3000; // 50 game-hours in minutes

export interface Position {
  lat: number;
  lng: number;
}

export interface HidingZoneCheck {
  lat: number;
  lng: number;
  radius: number;
}

/**
 * Check if the seeker has entered the hiding zone.
 */
export function checkWinCondition(
  seekerPos: Position,
  hidingZone: HidingZoneCheck,
): boolean {
  const distance = haversineDistance(
    seekerPos.lat, seekerPos.lng,
    hidingZone.lat, hidingZone.lng,
  );
  return distance <= hidingZone.radius;
}

/**
 * Check if the seeking phase time limit has been reached.
 */
export function checkTimeLimit(seekingMinutes: number): boolean {
  return seekingMinutes >= SEEKING_TIME_LIMIT;
}
