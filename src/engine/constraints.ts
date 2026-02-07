export type ConstraintType = 'circle' | 'half-plane' | 'text';

export interface CircleConstraint {
  type: 'circle';
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  /** true = hider is inside the circle, false = outside */
  inside: boolean;
  label: string;
}

export interface HalfPlaneConstraint {
  type: 'half-plane';
  axis: 'latitude' | 'longitude';
  value: number;
  /** 'above'/'below' for lat, 'east'/'west' for lng */
  direction: 'above' | 'below' | 'east' | 'west';
  label: string;
}

export interface TextConstraint {
  type: 'text';
  label: string;
  value: string;
}

export type Constraint = CircleConstraint | HalfPlaneConstraint | TextConstraint;
