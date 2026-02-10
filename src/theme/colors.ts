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
  Portugal: 'PRT',
  Sweden: 'SWE',
  Norway: 'NOR',
  Bulgaria: 'BGR',
  Croatia: 'HRV',
  Greece: 'GRC',
  Romania: 'ROU',
  Serbia: 'SRB',
  Slovenia: 'SVN',
  'North Macedonia': 'MKD',
  Slovakia: 'SVK',
  Luxembourg: 'LUX',
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
  Portugal:         { fill: '#0d9488', station: '#2dd4bf', border: '#0d9488' },
  Sweden:           { fill: '#2563eb', station: '#60a5fa', border: '#2563eb' },
  Norway:           { fill: '#7c3aed', station: '#a78bfa', border: '#7c3aed' },
  Bulgaria:         { fill: '#b45309', station: '#d97706', border: '#b45309' },
  Croatia:          { fill: '#dc2626', station: '#f87171', border: '#dc2626' },
  Greece:           { fill: '#0284c7', station: '#38bdf8', border: '#0284c7' },
  Romania:          { fill: '#ca8a04', station: '#facc15', border: '#ca8a04' },
  Serbia:           { fill: '#9333ea', station: '#c084fc', border: '#9333ea' },
  Slovenia:         { fill: '#059669', station: '#34d399', border: '#059669' },
  'North Macedonia': { fill: '#e11d48', station: '#fb7185', border: '#e11d48' },
  Slovakia:         { fill: '#4f46e5', station: '#818cf8', border: '#4f46e5' },
  Luxembourg:       { fill: '#0891b2', station: '#22d3ee', border: '#0891b2' },
};

/** Train type colors (legacy, used for fallback) */
export const TRAIN_COLORS: Record<TrainType, string> = {
  express: '#eab308',
  regional: '#3b82f6',
  local: '#9ca3af',
};

/** Per-country railway colors for train rendering */
export const RAILWAY_COLORS: Record<string, { train: string; engine: string }> = {
  France:           { train: '#B42B6D', engine: '#D45A95' },
  'United Kingdom': { train: '#1A6B7E', engine: '#35A0B5' },
  Germany:          { train: '#EC0016', engine: '#FF4040' },
  Netherlands:      { train: '#FFC61E', engine: '#FFD95C' },
  Belgium:          { train: '#2563A8', engine: '#5590D0' },
  Switzerland:      { train: '#EB0000', engine: '#FF3333' },
  Austria:          { train: '#E2002A', engine: '#FF4D60' },
  Italy:            { train: '#008856', engine: '#33B87A' },
  Spain:            { train: '#7B2FA0', engine: '#A562CC' },
  'Czech Republic': { train: '#007CB0', engine: '#33AAD4' },
  Poland:           { train: '#E06000', engine: '#FF8833' },
  Hungary:          { train: '#7CB342', engine: '#A5D46A' },
  Denmark:          { train: '#8B1A30', engine: '#B83D55' },
  Portugal:         { train: '#006847', engine: '#33996A' },
  Sweden:           { train: '#003F8C', engine: '#3370B8' },
  Norway:           { train: '#BA0C2F', engine: '#D44060' },
  Bulgaria:         { train: '#00966E', engine: '#33B890' },
  Croatia:          { train: '#003DA5', engine: '#336BC4' },
  Greece:           { train: '#0050A0', engine: '#3378C0' },
  Romania:          { train: '#002B7F', engine: '#335CA5' },
  Serbia:           { train: '#6C1D45', engine: '#964D70' },
  Slovenia:         { train: '#005DA6', engine: '#3383C0' },
  'North Macedonia': { train: '#CE2028', engine: '#DE5558' },
  Slovakia:         { train: '#0B4EA2', engine: '#3B78C0' },
  Luxembourg:       { train: '#00A1DE', engine: '#33C0EB' },
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
