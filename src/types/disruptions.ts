export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm';

export interface WeatherZone {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  weatherType: WeatherType;
  windBearing: number;          // degrees, direction zone drifts
  windSpeedKmh: number;         // how fast center moves
  growthRateKmPerHour: number;  // negative = shrinking
  createdAt: number;            // game minutes
  expiresAt: number;            // game minutes
}

export interface TrainDelay {
  trainInstanceId: string;      // "{routeId}:{dir}:{originDep}"
  delayMinutes: number;
  originalDelayMinutes: number;
  escalationCount: number;
  createdAt: number;            // game minutes
  nextEscalationAt: number;     // game minutes
  resolved: boolean;
}

export interface TrainAccident {
  trainInstanceId: string;
  stoppedAtLat: number;
  stoppedAtLng: number;
  segmentFromStationId: string;
  segmentToStationId: string;
  progress: number;             // 0-1 along segment
  createdAt: number;            // game minutes
  resumeAt: number;             // game minutes
  isFatal: boolean;
}
