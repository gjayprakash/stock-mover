// Requests between stores (#79) and the shipment each approval creates (used by #82). Runs after AUTH_SCHEMA.
export const REQUESTS_SCHEMA = `
  create table if not exists transfer_requests (
    id uuid primary key default gen_random_uuid(),
    from_location text not null,
    to_location text not null,
    status text not null,
    requested_by uuid references users(id),
    decided_by uuid references users(id),
    value_mrp int not null,
    needs_signoff boolean not null default false,
    signed_off_by uuid references users(id),
    engine_move_id text,
    reason text,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists transfer_requests_from on transfer_requests (from_location, status);
  create index if not exists transfer_requests_to on transfer_requests (to_location, status);
  create table if not exists transfer_lines (
    request_id uuid not null references transfer_requests(id) on delete cascade,
    sku_id text not null,
    qty int not null check (qty > 0),
    primary key (request_id, sku_id)
  );
  create table if not exists transfer_events (
    id bigserial primary key,
    request_id uuid not null references transfer_requests(id) on delete cascade,
    actor uuid references users(id),
    from_status text,
    to_status text not null,
    at timestamptz not null default now(),
    note text
  );
  create index if not exists transfer_events_request on transfer_events (request_id);
  create table if not exists shipments (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null unique references transfer_requests(id) on delete cascade,
    driver_id uuid references drivers(id),
    assigned_by uuid references users(id),
    assigned_at timestamptz,
    picked_up_at timestamptz,
    delivered_at timestamptz,
    received_by uuid references users(id),
    received_at timestamptz,
    qty_received int
  );`;
