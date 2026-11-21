import { KM_PER_DAY, PACKING_DAYS, ROAD_FACTOR } from '../engine/params';

export type LatLng = { lat: number; lng: number };

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** No routing service is wired, so road km = straight line × ROAD_FACTOR. */
export const roadKm = (a: LatLng, b: LatLng) => Math.round(haversineKm(a, b) * ROAD_FACTOR);

/** 0 km → 1 day, 9 km → 2, 600 km → 3, 2,000 km → 7. */
export const travelDays = (km: number) => PACKING_DAYS + Math.ceil(km / KM_PER_DAY);
