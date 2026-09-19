import type { Coordinate } from "./flight-plan";

/** Geodesic accuracy radius in metres, independent of map zoom and latitude. */
export function accuracyRing(center: Coordinate, radius: number): Coordinate[] {
  if (!Number.isFinite(radius) || radius <= 0) return [];
  const rad = Math.PI / 180, distance = radius / 6371008.8;
  const lat = center[1] * rad, lon = center[0] * rad;
  const ring: Coordinate[] = [];
  for (let i = 0; i < 64; i++) {
    const bearing = i * 2 * Math.PI / 64;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat));
    ring.push([nextLon / rad, nextLat / rad]);
  }
  return [...ring, ring[0]];
}
