import type { NewStoreRequest } from '@sm/contract';

/** Same rules and messages as StoresService.create in apps/api/src/stores/stores.service.ts. */
export const TIERS: { value: NewStoreRequest['tier']; label: string }[] = [
  { value: 'S++', label: 'S++ · flagship' },
  { value: 'S+', label: 'S+ · large' },
  { value: 'A', label: 'A · regular' },
  { value: 'B', label: 'B · small' },
];
export const CAPACITY_MIN = 100;
export const CAPACITY_MAX = 10_000;
const CODE = /^[A-Z]{3}-\d{2}$/;

export type FormValues = {
  city: string;
  store_id: string;
  tier: string;
  capacity: string;
  opened_on: string;
  pin: string;
  address: string;
  lat: string;
  lng: string;
};

export type Errors = Partial<Record<keyof FormValues, string>>;

export function validate(v: FormValues): Errors {
  const e: Errors = {};
  const id = v.store_id.trim().toUpperCase();
  if (!CODE.test(id)) e.store_id = 'Store code must look like ABC-01';
  if (!v.city.trim()) e.city = 'City is required';
  if (!TIERS.some((t) => t.value === v.tier)) e.tier = 'Store type must be S++, S+, A or B';
  const cap = Number(v.capacity);
  if (!/^\d+$/.test(v.capacity.trim()) || cap < CAPACITY_MIN || cap > CAPACITY_MAX)
    e.capacity = `Space for stock must be a whole number from ${CAPACITY_MIN} to ${CAPACITY_MAX.toLocaleString('en-IN')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.opened_on) || Number.isNaN(Date.parse(v.opened_on + 'T00:00:00Z')))
    e.opened_on = 'Opening date must be a date (YYYY-MM-DD)';
  if (!/^\d{6}$/.test(v.pin.trim())) e.pin = 'PIN code must be 6 digits';
  if (!v.address.trim()) e.address = 'Address is required';
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (v.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = 'Latitude must be a number from -90 to 90';
  if (v.lng.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = 'Longitude must be a number from -180 to 180';
  return e;
}

export function toRequest(v: FormValues): NewStoreRequest {
  return {
    store_id: v.store_id.trim().toUpperCase(),
    city: v.city.trim(),
    tier: v.tier as NewStoreRequest['tier'],
    capacity: Number(v.capacity),
    opened_on: v.opened_on,
    pin: v.pin.trim(),
    address: v.address.trim(),
    lat: Number(v.lat),
    lng: Number(v.lng),
  };
}
