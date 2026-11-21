// Engine tunables. rules.csv defines no cover/ageing thresholds, so these defaults stand.
export const AS_OF = '2026-10-31';
export const TODAY = '2026-11-01';
export const WAREHOUSE_ID = 'WH-KOL';
export const WINDOW_DAYS = 84; // weeks ending 2026-08-15 … 2026-10-31 (Sun–Sat)
export const WINDOW_START = '2026-08-09';
export const K = 14; // prior weight in in-stock days
export const TARGET_COVER = 45;
export const DONOR_KEEP = 60;
export const MIN_DONOR_COVER = 30;
export const AGE_DAYS = 90;
export const AGE_COVER = 120;
export const SIGNOFF_INR = 100000;
export const NEW_STORE_DAYS = 60;
export const LOW_COVER_DISPLAY = 21;
export const BASIS_OWN_DAYS = 42;
export const BASIS_BLENDED_DAYS = 14;
