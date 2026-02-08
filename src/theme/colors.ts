import type { TrainType } from '../types/game';

/** Map game country names to ISO 3166-1 alpha-3 codes */
export const COUNTRY_TO_ISO3: Record<string, string> = {
  France: 'FRA',
  'United Kingdom': 'GBR',
  Germany: 'DEU',
  Netherlands: 'NLD',
  Belgium: 'BEL',
  Switzerland: 'CHE',
  Austria: 'AUT',
  Italy: 'ITA',
  Spain: 'ESP',
  'Czech Republic': 'CZE',
  Poland: 'POL',
  Hungary: 'HUN',
  Denmark: 'DNK',
};

export const ALL_GAME_ISOS = Object.values(COUNTRY_TO_ISO3);

/** Per-country colors for map fills and station dots */
export const COUNTRY_COLORS: Record<string, { fill: string; station: string; border: string }> = {
  France:           { fill: '#6366f1', station: '#818cf8', border: '#6366f1' },
  'United Kingdom': { fill: '#2dd4bf', station: '#5eead4', border: '#2dd4bf' },
  Germany:          { fill: '#f97316', station: '#fb923c', border: '#f97316' },
  Netherlands:      { fill: '#f59e0b', station: '#fbbf24', border: '#f59e0b' },
  Belgium:          { fill: '#eab308', station: '#facc15', border: '#eab308' },
  Switzerland:      { fill: '#ef4444', station: '#f87171', border: '#ef4444' },
  Austria:          { fill: '#ec4899', station: '#f472b6', border: '#ec4899' },
  Italy:            { fill: '#22c55e', station: '#4ade80', border: '#22c55e' },
  Spain:            { fill: '#a855f7', station: '#c084fc', border: '#a855f7' },
  'Czech Republic': { fill: '#06b6d4', station: '#22d3ee', border: '#06b6d4' },
  Poland:           { fill: '#d946ef', station: '#e879f9', border: '#d946ef' },
  Hungary:          { fill: '#84cc16', station: '#a3e635', border: '#84cc16' },
  Denmark:          { fill: '#14b8a6', station: '#2dd4bf', border: '#14b8a6' },
};

/** Train type colors */
export const TRAIN_COLORS: Record<TrainType, string> = {
  express: '#eab308',
  regional: '#3b82f6',
  local: '#9ca3af',
};

/** Mapbox data-driven expression: station dot color by country property */
export function stationColorMatchExpression(): mapboxgl.Expression {
  const cases: (string)[] = [];
  for (const [country, colors] of Object.entries(COUNTRY_COLORS)) {
    cases.push(country, colors.station);
  }
  return ['match', ['get', 'country'], ...cases, '#fbbf24'] as mapboxgl.Expression;
}

/** Mapbox data-driven expression: country fill color by iso_3166_1_alpha_3 */
export function countryFillMatchExpression(): mapboxgl.Expression {
  const cases: string[] = [];
  for (const [country, colors] of Object.entries(COUNTRY_COLORS)) {
    const iso = COUNTRY_TO_ISO3[country];
    if (iso) cases.push(iso, colors.fill);
  }
  return ['match', ['get', 'iso_3166_1_alpha_3'], ...cases, 'rgba(0,0,0,0)'] as mapboxgl.Expression;
}

/** Mapbox data-driven expression: country border color by iso_3166_1_alpha_3 */
export function countryBorderMatchExpression(): mapboxgl.Expression {
  const cases: string[] = [];
  for (const [country, colors] of Object.entries(COUNTRY_COLORS)) {
    const iso = COUNTRY_TO_ISO3[country];
    if (iso) cases.push(iso, colors.border);
  }
  return ['match', ['get', 'iso_3166_1_alpha_3'], ...cases, 'rgba(0,0,0,0)'] as mapboxgl.Expression;
}
