import type { Question } from './questionPool';
import type { Constraint } from '../engine/constraints';
import { haversineDistance } from '../engine/geo';
import { getStations, getStationList } from '../data/graph';
import { COUNTRY_DATA } from '../data/countryData';
import type { Station } from '../types/game';

/** Find distance from a position to the nearest station matching a filter */
export function nearestStationDistance(
  pos: { lat: number; lng: number },
  candidates: Station[],
): number {
  let min = Infinity;
  for (const c of candidates) {
    const d = haversineDistance(pos.lat, pos.lng, c.lat, c.lng);
    if (d < min) min = d;
  }
  return min;
}

// Cached filtered station lists for thermometer evaluations
let _coastalStations: Station[] | null = null;
let _capitalStations: Station[] | null = null;
let _mountainousStations: Station[] | null = null;

function getCoastalStations(): Station[] {
  if (!_coastalStations) _coastalStations = getStationList().filter(s => s.isCoastal);
  return _coastalStations;
}
function getCapitalStations(): Station[] {
  if (!_capitalStations) _capitalStations = getStationList().filter(s => s.isCapital);
  return _capitalStations;
}
function getMountainousStations(): Station[] {
  if (!_mountainousStations) _mountainousStations = getStationList().filter(s => s.isMountainous);
  return _mountainousStations;
}

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

    case 'prec-coastal': {
      const isCoastal = hider.isCoastal;
      return {
        answer: isCoastal ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Coastal station',
          value: isCoastal ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-mountain': {
      const isMountainous = hider.isMountainous;
      return {
        answer: isMountainous ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Mountainous region',
          value: isMountainous ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-capital': {
      const isCapital = hider.isCapital;
      return {
        answer: isCapital ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Capital city',
          value: isCapital ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-landlocked': {
      const countryInfo = COUNTRY_DATA[hider.country];
      const isLandlocked = countryInfo?.landlocked ?? false;
      return {
        answer: isLandlocked ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Landlocked country',
          value: isLandlocked ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-country-area': {
      const countryInfo2 = COUNTRY_DATA[hider.country];
      const isLarge = countryInfo2?.areaOver200k ?? false;
      return {
        answer: isLarge ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Large country (>200k km²)',
          value: isLarge ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-olympic': {
      const hosted = hider.hasHostedOlympics;
      return {
        answer: hosted ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Olympic host city',
          value: hosted ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-beer-wine': {
      const countryInfo3 = COUNTRY_DATA[hider.country];
      const beerOrWine = countryInfo3?.beerOrWine ?? 'beer';
      const label = beerOrWine === 'beer' ? 'Beer country' : 'Wine country';
      return {
        answer: beerOrWine === 'beer' ? 'Beer' : 'Wine',
        constraint: {
          type: 'text',
          label,
          value: beerOrWine === 'beer' ? 'Beer' : 'Wine',
        },
      };
    }

    case 'prec-ancient': {
      const isAncient = hider.isAncient;
      return {
        answer: isAncient ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Ancient city (>2000 years)',
          value: isAncient ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-f1': {
      const countryInfo4 = COUNTRY_DATA[hider.country];
      const hasF1 = countryInfo4?.hasF1Circuit ?? false;
      return {
        answer: hasF1 ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'Country has F1 circuit',
          value: hasF1 ? 'Yes' : 'No',
        },
      };
    }

    case 'prec-metro': {
      const hasMetro = hider.hasMetro;
      return {
        answer: hasMetro ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: 'City has metro',
          value: hasMetro ? 'Yes' : 'No',
        },
      };
    }

    case 'thermo-coast': {
      const coastal = getCoastalStations();
      const hiderDist = nearestStationDistance(hider, coastal);
      const seekerDist = nearestStationDistance(seeker, coastal);
      const nearer = hiderDist < seekerDist;
      return {
        answer: nearer ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: nearer ? 'Hider nearer to coast' : 'Hider further from coast',
          value: String(Math.round(seekerDist)),
        },
      };
    }

    case 'thermo-capital': {
      const capitals = getCapitalStations();
      const hiderDistCap = nearestStationDistance(hider, capitals);
      const seekerDistCap = nearestStationDistance(seeker, capitals);
      const nearerCap = hiderDistCap < seekerDistCap;
      return {
        answer: nearerCap ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: nearerCap ? 'Hider nearer to capital' : 'Hider further from capital',
          value: String(Math.round(seekerDistCap)),
        },
      };
    }

    case 'thermo-mountain': {
      const mountains = getMountainousStations();
      const hiderDistMtn = nearestStationDistance(hider, mountains);
      const seekerDistMtn = nearestStationDistance(seeker, mountains);
      const nearerMtn = hiderDistMtn < seekerDistMtn;
      return {
        answer: nearerMtn ? 'Yes' : 'No',
        constraint: {
          type: 'text',
          label: nearerMtn ? 'Hider nearer to mountains' : 'Hider further from mountains',
          value: String(Math.round(seekerDistMtn)),
        },
      };
    }

    default:
      return { answer: 'Unknown question', constraint: null };
  }
}
