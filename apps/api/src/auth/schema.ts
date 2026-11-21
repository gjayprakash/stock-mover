// Plain module (no Nest imports) so scripts/seed-admin.ts can run it too.
export const AUTH_SCHEMA = `
  create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text not null,
    mobile text,
    role text not null check (role in ('super_admin', 'store_manager')),
    location_id text,
    password_hash text,
    active boolean not null default true,
    created_by uuid references users(id),
    created_at timestamptz not null default now(),
    last_sign_in_at timestamptz,
    check (role = 'super_admin' or location_id is not null)
  );
  create unique index if not exists one_super_admin on users ((true)) where role = 'super_admin';
  create table if not exists sessions (
    token_hash bytea primary key,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_seen_at timestamptz not null default now(),
    user_agent text
  );
  create index if not exists sessions_user_id on sessions (user_id);
  create table if not exists invites (
    token_hash bytea primary key,
    user_id uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    used_at timestamptz
  );`;
