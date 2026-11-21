// Drivers (#81). Runs after AUTH_SCHEMA (references users).
export const DRIVERS_SCHEMA = `
  create table if not exists drivers (
    id uuid primary key default gen_random_uuid(),
    location_id text not null,
    name text not null,
    phone_e164 text not null,
    lang text check (lang in ('hi', 'en')),
    active boolean not null default true,
    created_by uuid references users(id),
    created_at timestamptz not null default now()
  );
  create index if not exists drivers_location_id on drivers (location_id);
  create table if not exists device_pairings (
    id uuid primary key default gen_random_uuid(),
    driver_id uuid not null references drivers(id) on delete cascade,
    token_hash bytea not null unique,
    created_by uuid references users(id),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
  );
  create table if not exists driver_devices (
    id uuid primary key default gen_random_uuid(),
    driver_id uuid not null references drivers(id) on delete cascade,
    token_hash bytea not null unique,
    paired_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    revoked_at timestamptz,
    user_agent text
  );
  create index if not exists driver_devices_driver_id on driver_devices (driver_id);`;
