import { Chip } from '../../components/Chip';
import { pieces } from '../../lib/format';
import type { Dir, Driver, Shipment } from './api';
import { AssignDriver } from './AssignDriver';
import { lastUpdate, statusChip } from './status';

type Props = {
  dir: Dir;
  rows: Shipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  drivers: Driver[] | null;
  onAssign: (id: string, driverId: string) => Promise<void>;
};

const route = (s: Shipment, dir: Dir) => (dir === 'in' ? `${s.from_id} → you` : `you → ${s.to_id}`);

/** Product, route, driver (or Assign a driver), status chip, last update. Row click selects. */
export function ShipmentsTable({ dir, rows, selectedId, onSelect, drivers, onAssign }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
      <table className="w-full min-w-[820px] border-collapse text-[15px]">
        <thead>
          <tr className="text-left text-sm text-muted">
            <th scope="col" className="border-b border-line px-5 py-4 font-bold">Product</th>
            <th scope="col" className="border-b border-line px-3 py-4 font-bold">Route</th>
            <th scope="col" className="border-b border-line px-3 py-4 font-bold">Driver</th>
            <th scope="col" className="border-b border-line px-3 py-4 font-bold">Status</th>
            <th scope="col" className="border-b border-line px-5 py-4 font-bold">Last update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const chip = statusChip(s, dir);
            const canAssign = dir === 'out' && s.status === 'approved' && !s.driver;
            const selected = s.id === selectedId;
            return (
              <tr
                key={s.id}
                onClick={() => onSelect(s.id)}
                aria-selected={selected}
                className={`cursor-pointer ${selected ? 'bg-[#FFF6F0]' : 'hover:bg-page'}`}
              >
                <td className="border-b border-[#F4E8D0] px-5 py-3.5">
                  <button type="button" onClick={() => onSelect(s.id)} className="text-left font-semibold text-ink">
                    {s.style_name} · {s.size}
                  </button>
                  <div className="text-sm text-muted">{pieces(s.qty)}</div>
                </td>
                <td className="border-b border-[#F4E8D0] px-3 py-3.5">{route(s, dir)}</td>
                <td className="border-b border-[#F4E8D0] px-3 py-3.5" onClick={(e) => canAssign && e.stopPropagation()}>
                  {canAssign ? (
                    <AssignDriver drivers={drivers} onAssign={(d) => onAssign(s.id, d)} />
                  ) : (
                    s.driver?.name ?? <span className="text-muted">No driver yet</span>
                  )}
                </td>
                <td className="border-b border-[#F4E8D0] px-3 py-3.5">
                  <Chip tone={chip.tone}>{chip.label}</Chip>
                </td>
                <td className="border-b border-[#F4E8D0] px-5 py-3.5 text-[#4A3A2E]">{lastUpdate(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
