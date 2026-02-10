import type { TrainAccident } from '../types/disruptions';

export interface SegmentBlock {
  fromStationId: string;
  toStationId: string;
  accidentProgress: number;  // 0-1, where on the segment the accident is
  resumeAt: number;
  accidentTrainId: string;
}

/**
 * Derive blocked segments from active accidents.
 * Returns Map<"fromId:toId", SegmentBlock> — directional key.
 * Multiple accidents on the same segment: keeps the one with lowest progress (most restrictive).
 */
export function getBlockedSegments(
  accidents: Map<string, TrainAccident>,
  gameMinutes: number,
): Map<string, SegmentBlock> {
  const blocked = new Map<string, SegmentBlock>();

  for (const [trainId, accident] of accidents) {
    // Skip cleared accidents
    if (gameMinutes >= accident.resumeAt) continue;
    // Skip accidents without segment info
    if (!accident.segmentFromStationId || !accident.segmentToStationId) continue;

    const key = `${accident.segmentFromStationId}:${accident.segmentToStationId}`;
    const existing = blocked.get(key);

    // Keep the lowest progress (most restrictive — blocks more trains behind it)
    if (!existing || accident.progress < existing.accidentProgress) {
      blocked.set(key, {
        fromStationId: accident.segmentFromStationId,
        toStationId: accident.segmentToStationId,
        accidentProgress: accident.progress,
        resumeAt: accident.resumeAt,
        accidentTrainId: trainId,
      });
    }
  }

  return blocked;
}

/**
 * Check if a specific train is blocked on a segment.
 * Returns true if the segment is blocked AND the train is not the accident train itself.
 * ALL trains on a blocked segment are stopped until the accident resolves.
 */
export function isTrainBlockedOnSegment(
  blockedSegments: Map<string, SegmentBlock>,
  fromStationId: string,
  toStationId: string,
  trainInstanceId: string,
): boolean {
  const key = `${fromStationId}:${toStationId}`;
  const block = blockedSegments.get(key);
  if (!block) return false;
  // Don't block the accident train itself
  if (block.accidentTrainId === trainInstanceId) return false;
  return true;
}

/**
 * Get the SegmentBlock for a directional segment, or null if not blocked.
 */
export function getSegmentBlock(
  blockedSegments: Map<string, SegmentBlock>,
  fromStationId: string,
  toStationId: string,
): SegmentBlock | null {
  return blockedSegments.get(`${fromStationId}:${toStationId}`) ?? null;
}

/**
 * Simple check: is this directional segment blocked at all?
 */
export function isSegmentBlocked(
  blockedSegments: Map<string, SegmentBlock>,
  fromStationId: string,
  toStationId: string,
): boolean {
  return blockedSegments.has(`${fromStationId}:${toStationId}`);
}
