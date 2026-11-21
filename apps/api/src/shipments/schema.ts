// Location pings (#82). Runs after the transfer tables (#79: transfer_requests, transfer_lines, transfer_events, shipments).
export const SHIPMENTS_SCHEMA = `
  create table if not exists location_pings (
    id bigserial primary key,
    shipment_id uuid not null references shipments(id) on delete cascade,
    device_id uuid references driver_devices(id) on delete set null,
    lat double precision not null,
    lng double precision not null,
    accuracy_m real,
    place text,
    taken_at timestamptz not null,
    received_at timestamptz not null default now()
  );
  create index if not exists location_pings_shipment on location_pings (shipment_id, taken_at desc);`;
