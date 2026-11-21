// Stroke icons drawn for the driver screens (canvas D-Join / D-Trip / D-Sent / D-Delivered).
type P = { size?: number; className?: string; stroke?: number };

const svg = (d: React.ReactNode, { size = 24, className, stroke = 2 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{d}</svg>
);

export const Speaker = (p: P) => svg(<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>, p);
export const Tick = (p: P) => svg(<path d="M5 12l5 5 9-10" />, p);
export const Cross = (p: P) => svg(<path d="M6 6l12 12M18 6L6 18" />, p);
export const Shop = (p: P) => svg(<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" />, p);
export const Phone = (p: P) => svg(<><rect x="6.5" y="2" width="11" height="20" rx="2.5" /><path d="M11 18.5h2" /></>, p);
export const Flag = (p: P) => svg(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />, p);
export const Pin = (p: P) => svg(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.6" /></>, p);
export const Clock = (p: P) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p);
export const BoxTick = (p: P) => svg(<><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>, p);
export const Box = (p: P) => svg(<><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>, p);
export const Call = (p: P) => svg(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />, p);
export const Camera = (p: P) => svg(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>, p);
export const Back = (p: P) => svg(<path d="M15 5l-7 7 7 7" />, p);
export const ArrowDown = (p: P) => svg(<path d="M12 2v18m-6-6 6 6 6-6" />, p);
export const Wifi = (p: P) => svg(<><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /><path d="M3 3l18 18" /></>, p);
export const Truck = (p: P) => svg(<><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" /><circle cx="6" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></>, p);
export const Link = (p: P) => svg(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />, p);

/** Stock Mover mark (same as the canvas header). */
export const Mark = () => (
  <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
    <rect x="1" y="1" width="32" height="32" rx="8" fill="#511D00" />
    <path d="M9 13h13m0 0-4-4m4 4-4 4M25 21H12m0 0 4-4m-4 4 4 4" fill="none" stroke="#F4A27C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Phone showing the browser's "Allow location" prompt, so the driver knows which button to press. */
export const AllowPicture = () => (
  <svg width="150" height="190" viewBox="0 0 150 190" aria-hidden="true">
    <rect x="25" y="4" width="100" height="182" rx="16" fill="#FFFFFF" stroke="#511D00" strokeWidth="4" />
    <rect x="35" y="60" width="80" height="70" rx="10" fill="#F8ECD7" />
    <g transform="translate(63 66)" stroke="#C7400E" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.6" />
    </g>
    <rect x="42" y="100" width="30" height="20" rx="6" fill="#E6D3B0" />
    <rect x="78" y="100" width="30" height="20" rx="6" fill="#1D6B4F" />
    <path d="M86 110l4 4 8-8" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M110 150l-12-28" stroke="#C7400E" strokeWidth="4" strokeLinecap="round" />
    <path d="M94 128l4-8 7 6" stroke="#C7400E" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Quick-settings tile for Location, switched on. */
export const LocationSwitchPicture = () => (
  <svg width="220" height="120" viewBox="0 0 220 120" aria-hidden="true">
    <rect x="4" y="4" width="212" height="112" rx="22" fill="#FFFFFF" stroke="#511D00" strokeWidth="4" />
    <g transform="translate(26 36) scale(2)" stroke="#C7400E" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.6" />
    </g>
    <rect x="100" y="38" width="96" height="48" rx="24" fill="#1D6B4F" />
    <circle cx="172" cy="62" r="18" fill="#FFFFFF" />
  </svg>
);

/** Empty truck for "no goods right now". */
export const EmptyTruckPicture = () => (
  <svg width="200" height="130" viewBox="0 0 200 130" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="10" y="22" width="110" height="74" rx="8" fill="#FFFFFF" stroke="#511D00" strokeWidth="4" strokeDasharray="10 8" />
    <path d="M120 46h38l26 26v24h-64z" fill="#F8ECD7" stroke="#511D00" strokeWidth="4" />
    <path d="M136 54h18l14 16h-32z" fill="#FFFFFF" stroke="#511D00" strokeWidth="3" />
    <circle cx="44" cy="104" r="14" fill="#FFFFFF" stroke="#511D00" strokeWidth="4" />
    <circle cx="156" cy="104" r="14" fill="#FFFFFF" stroke="#511D00" strokeWidth="4" />
    <path d="M6 112h188" stroke="#D9C49C" strokeWidth="3" />
  </svg>
);
