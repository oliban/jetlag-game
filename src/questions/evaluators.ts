import type { Question } from './questionPool';
import type { Constraint } from '../engine/constraints';
import { haversineDistance } from '../engine/geo';
import { getStations } from '../data/graph';

export interface EvaluationResult {
  answer: string;
  constraint: Constraint | null;
}

/**
 * Evaluate a question given hider and seeker positions.
 * seekerPos can be a station ID or explicit {lat, lng, country?} for in-transit evaluation.
 * All answers are "Yes" or "No".
 */
export function evaluateQuestion(
  question: Question,
  hiderStationId: string,
  seekerPos: string | { lat: number; lng: number; country?: string },
): EvaluationResult {
  const stations = getStations();
  const hider = stations[hiderStationId];
  const seeker = typeof seekerPos === 'string'
    ? stations[seekerPos]
    : seekerPos;

  if (!hider || !seeker) {
    return { answer: 'Unknown', constraint: null };
  }

  switch (question.id) {
    case 'radar-100':
    case 'radar-200':
    case 'radar-500': {
      const dist = haversineDistance(hider.lat, hider.lng, seeker.lat, seeker.lng);
      const radius = question.param!;
      const inside = dist <= radius;
      return {
        answer: inside ? 'Yes' : 'No',
        constraint: {
          type: 'circle',
          centerLat: seeker.lat,
          centerLng: seeker.lng,
          radiusKm: radius,
          inside,
          label: inside ? `Within ${radius}km` : `Beyond ${radius}km`,
        },
      };
    }

    case 'rel-north': {
      const isNorth = hider.lat > seeker.lat;
      return {
        answer: isNorth ? 'Yes' : 'No',
        constraint: {
          type: 'half-plane',
          axis: 'latitude',
          value: seeker.lat,
          direction: isNorth ? 'above' : 'below',
          label: isNorth ? 'Hider is north of seeker' : 'Hider is south of seeker',
        },
      };
    }

    case 'rel-east': {
      const isEast = hider.lng > seeker.lng;
      return {
        answer: isEast ? 'Yes' : 'No',
        constraint: {
          type: 'half-plane',
          axis: 'longitude',
          value: seeker.lng,
          direction: isEast ? 'east' : 'west',
          label: isEast ? 'Hider is east of seeker' : 'Hider is west of seeker',
        },
      };
    }

    case 'prec-same-country': {
      const seekerCountry = 'country' in seeker ? seeker.country : undefined;
      const same = !!seekerCountry && hider.country === seekerCountry;
      return {
        answer: same ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: same ? `In ${seekerCountry}` : `Not in ${seekerCountry ?? 'unknown'}`,
          value: same ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-hub': {
      const isHub = hider.connections >= 4;
      return {
        answer: isHub ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Hub station (4+ connections)',
          value: isHub ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-name-am': {
      const firstChar = hider.name[0].toUpperCase();
      const isAM = firstChar >= 'A' && firstChar <= 'M';
      return {
        answer: isAM ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Station name A–M',
          value: isAM ? 'Yes' : 'No',
        },
      };
    }

    default:
      return { answer: 'Unknown question', constraint: null };
  }
}
