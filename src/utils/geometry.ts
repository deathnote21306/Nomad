import type { NavNode } from '../types';

/** Euclidean distance between two normalized points */
export function normalizedDistance(a: NavNode, b: NavNode): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Categorise distance value */
export function categoriseDistance(d: number): 'short' | 'medium' | 'long' {
  if (d < 0.12) return 'short';
  if (d < 0.28) return 'medium';
  return 'long';
}

/** Cardinal direction from a → b (8-way) */
export function cardinalDirection(a: NavNode, b: NavNode): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y; // positive = down in image coords

  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // –180 to 180

  // Normalise to 0–360 clockwise from East
  const deg = (angle + 360) % 360;

  if (deg >= 337.5 || deg < 22.5)  return 'east';
  if (deg < 67.5)                  return 'southeast';
  if (deg < 112.5)                 return 'south';
  if (deg < 157.5)                 return 'southwest';
  if (deg < 202.5)                 return 'west';
  if (deg < 247.5)                 return 'northwest';
  if (deg < 292.5)                 return 'north';
  return 'northeast';
}

/** Relative direction label (simplified) */
export function relativeDirection(cardinal: string): string {
  const map: Record<string, string> = {
    north:     'ahead',
    south:     'behind',
    east:      'right',
    west:      'left',
    northeast: 'forward-right',
    northwest: 'forward-left',
    southeast: 'back-right',
    southwest: 'back-left',
  };
  return map[cardinal] ?? 'straight';
}
