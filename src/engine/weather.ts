import type { WeatherType, WeatherZone } from '../types/disruptions';
import type { createSeededRandom } from '../utils/random';
import { haversineDistance } from './geo';
import { logger } from './logger';

type SeededRandom = ReturnType<typeof createSeededRandom>;

const WEATHER_SEVERITY: Record<WeatherType, number> = {
  clear: 0,
  cloudy: 1,
  rain: 2,
  storm: 3,
};

const MAX_ZONES = 8;
const SPAWN_RATE_PER_MINUTE = 1 / 180; // ~1 new zone every 120-240 min avg

/**
 * Advance all weather zones by deltaMinutes.
 * Drifts centers, grows/shrinks radii, upgrades weather, prunes expired zones,
 * and possibly spawns a new zone.
 */
export function tickWeather(
  zones: WeatherZone[],
  gameMinutes: number,
  deltaMinutes: number,
  rng: SeededRandom,
): WeatherZone[] {
  const updated: WeatherZone[] = [];

  for (const zone of zones) {
    const bearingRad = (zone.windBearing * Math.PI) / 180;
    const driftKm = (zone.windSpeedKmh / 60) * deltaMinutes;

    // Simple mercator approximation for lat/lng deltas
    const dLat = (driftKm * Math.cos(bearingRad)) / 111.32;
    const cosLat = Math.cos((zone.centerLat * Math.PI) / 180);
    const dLng = (driftKm * Math.sin(bearingRad)) / (111.32 * cosLat);

    const newLat = zone.centerLat + dLat;
    const newLng = zone.centerLng + dLng;

    const newRadius = zone.radiusKm + (zone.growthRateKmPerHour / 60) * deltaMinutes;

    // Remove zones that have shrunk away or expired
    if (newRadius <= 0 || gameMinutes >= zone.expiresAt) {
      logger.info('weather', `ZONE EXPIRED: ${zone.id} (${zone.weatherType}, lived ${Math.round(gameMinutes - zone.createdAt)}min)`);
      continue;
    }

    // Upgrade weather type based on age fraction (never downgrade)
    const age = gameMinutes - zone.createdAt;
    const lifetime = zone.expiresAt - zone.createdAt;
    const ageFraction = lifetime > 0 ? age / lifetime : 0;

    let weatherType = zone.weatherType;
    if (ageFraction > 0.66) {
      if (WEATHER_SEVERITY[weatherType] < WEATHER_SEVERITY.storm) {
        logger.info('weather', `ZONE UPGRADED: ${zone.id} ${weatherType} → storm (age ${Math.round(ageFraction * 100)}%)`);
        weatherType = 'storm';
      }
    } else if (ageFraction > 0.33) {
      if (WEATHER_SEVERITY[weatherType] < WEATHER_SEVERITY.rain) {
        logger.info('weather', `ZONE UPGRADED: ${zone.id} ${weatherType} → rain (age ${Math.round(ageFraction * 100)}%)`);
        weatherType = 'rain';
      }
    }

    updated.push({
      ...zone,
      centerLat: newLat,
      centerLng: newLng,
      radiusKm: newRadius,
      weatherType,
    });
  }

  if (shouldSpawnNewZone(updated, deltaMinutes, rng)) {
    const newZone = createWeatherZone(gameMinutes, rng);
    updated.push(newZone);
    logger.info('weather', `ZONE SPAWNED: ${newZone.id} at [${newZone.centerLat.toFixed(1)}, ${newZone.centerLng.toFixed(1)}] radius=${Math.round(newZone.radiusKm)}km (${updated.length} active)`);
  }

  return updated;
}

/**
 * Returns the worst weather affecting a given point.
 */
export function getWeatherAt(
  zones: WeatherZone[],
  lat: number,
  lng: number,
): WeatherType {
  let worst: WeatherType = 'clear';

  for (const zone of zones) {
    const dist = haversineDistance(lat, lng, zone.centerLat, zone.centerLng);
    if (dist <= zone.radiusKm) {
      if (WEATHER_SEVERITY[zone.weatherType] > WEATHER_SEVERITY[worst]) {
        worst = zone.weatherType;
      }
    }
  }

  return worst;
}

/**
 * Returns how many weather zones overlap at a given point.
 * 0 = clear (no zones), 1 = one zone, 2+ = overlapping zones.
 */
export function getWeatherOverlapCount(
  zones: WeatherZone[],
  lat: number,
  lng: number,
): number {
  let count = 0;
  for (const zone of zones) {
    const dist = haversineDistance(lat, lng, zone.centerLat, zone.centerLng);
    if (dist <= zone.radiusKm) {
      count++;
    }
  }
  return count;
}

/**
 * Probabilistic check for spawning a new weather zone.
 */
export function shouldSpawnNewZone(
  zones: WeatherZone[],
  deltaMinutes: number,
  rng: SeededRandom,
): boolean {
  if (zones.length >= MAX_ZONES) return false;
  return rng.random() < SPAWN_RATE_PER_MINUTE * deltaMinutes;
}

/**
 * Create a new weather zone with random parameters within Europe bounds.
 */
export function createWeatherZone(
  gameMinutes: number,
  rng: SeededRandom,
): WeatherZone {
  const centerLat = 40 + rng.random() * 16;   // 40-56
  const centerLng = -5 + rng.random() * 30;   // -5 to 25
  const radiusKm = 75 + rng.random() * 225;   // 75-300
  const windBearing = rng.random() * 360;
  const windSpeedKmh = 30 + rng.random() * 50; // 30-80
  const growthRateKmPerHour = -20 + rng.random() * 50; // -20 to +30
  const lifetime = 60 + rng.random() * 300;   // 60-360 minutes
  const suffix = Math.floor(rng.random() * 0xffff).toString(16).padStart(4, '0');

  return {
    id: `wz-${gameMinutes}-${suffix}`,
    centerLat,
    centerLng,
    radiusKm,
    weatherType: 'cloudy',
    windBearing,
    windSpeedKmh,
    growthRateKmPerHour,
    createdAt: gameMinutes,
    expiresAt: gameMinutes + lifetime,
  };
}

/**
 * Create 2-3 initial weather zones at game start.
 */
export function createInitialWeatherZones(rng: SeededRandom): WeatherZone[] {
  const count = rng.randInt(2, 3);
  const zones: WeatherZone[] = [];
  for (let i = 0; i < count; i++) {
    const zone = createWeatherZone(0, rng);
    zones.push(zone);
    logger.info('weather', `INITIAL ZONE: ${zone.id} at [${zone.centerLat.toFixed(1)}, ${zone.centerLng.toFixed(1)}] radius=${Math.round(zone.radiusKm)}km`);
  }
  logger.info('weather', `Created ${count} initial weather zones`);
  return zones;
}
