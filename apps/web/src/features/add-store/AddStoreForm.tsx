import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NearestLocation } from '@sm/contract';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Section } from '../../components/Section';
import { dateLong, num, storeLabel } from '../../lib/format';
import { NEW_STORE_DAYS, WAREHOUSE_ID } from '../../../../api/src/engine/params';
import { useMovesFile } from '../../data/useMovesFile';
import { createStore, lookupPin, nearestTo, nextCode, Unavailable, type CreatedStore } from './api';
import { ESTIMATE_NOTE, NearestList, TRAVEL_RULE } from './NearestList';
import { TIERS, CAPACITY_MAX, CAPACITY_MIN, toRequest, validate, type Errors, type FormValues } from './validate';

const EMPTY: FormValues = { city: '', store_id: '', tier: '', capacity: '', opened_on: '', pin: '', address: '', lat: '', lng: '' };

type Place = { label: string; sub: string } | null;
type Lookup = 'idle' | 'looking' | 'found' | 'not-found';

const inputCls = (bad: boolean) =>
  `h-[52px] w-full rounded-xl border-[1.5px] bg-[#FFFDF8] px-4 text-base text-ink outline-none focus:border-cta disabled:opacity-60 ${
    bad ? 'border-danger' : 'border-[#D9C49C]'
  }`;

function Field({ id, label, hint, error, wide, children }: { id: string; label: string; hint?: ReactNode; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? 'md:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children}
      {error ? (
        <span id={`${id}-err`} className="text-sm font-semibold text-danger">{error}</span>
      ) : (
        hint && <span className="text-sm text-muted">{hint}</span>
      )}
    </div>
  );
}

export function AddStoreForm() {
  const [v, setV] = useState<FormValues>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [serverErr, setServerErr] = useState<Errors>({});
  const [codeEdited, setCodeEdited] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [lookup, setLookup] = useState<Lookup>('idle');
  const [place, setPlace] = useState<Place>(null);
  const [manual, setManual] = useState(false);
  const [nearest, setNearest] = useState<NearestLocation[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedStore | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [usedFake, setUsedFake] = useState(false);
  const pinSeq = useRef(0);
  const pointSeq = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  const { data } = useMovesFile();
  const usedIds = useMemo(
    () => new Set([WAREHOUSE_ID, ...(data?.stores ?? []).map((s) => s.store_id)]),
    [data],
  );
  /** City value the last PIN lookup filled in, so a new or unknown PIN can replace or clear it. */
  const autoCity = useRef<string | null>(null);

  const errors = validate(v, usedIds);
  const valid = Object.keys(errors).length === 0;
  const done = created !== null;
  const codeUsed = usedIds.has(v.store_id.trim().toUpperCase());
  // "Already used" shows at once, as you type; other errors wait until you leave the field.
  const errOf = (k: keyof FormValues) =>
    serverErr[k] ?? (touched[k] || (k === 'store_id' && codeUsed) ? errors[k] : undefined);

  const set = (k: keyof FormValues, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    setServerErr((p) => ({ ...p, [k]: undefined }));
  };
  const touch = (k: keyof FormValues) => setTouched((p) => ({ ...p, [k]: true }));

  /** Every API call goes through here: notes the dev fake and turns "unreachable" into the plain state. */
  async function guard<T extends { fake?: true }>(p: Promise<T>): Promise<T | null> {
    try {
      const r = await p;
      if (r.fake) setUsedFake(true);
      return r;
    } catch (e) {
      if (e instanceof Unavailable) setUnavailable(true);
      else throw e;
      return null;
    }
  }

  async function suggestCode(city: string) {
    if (codeEdited || city.trim().length < 3) return;
    const r = await guard(nextCode(city.trim()));
    if (r?.store_id) {
      setV((p) => (p.city.trim() === city.trim() ? { ...p, store_id: r.store_id as string } : p));
      setSuggested(true);
    }
  }

  /** Drop everything the last PIN or point filled in, so nothing stale is shown. */
  function clearPlace(keepLatLng: boolean) {
    setPlace(null);
    setNearest([]);
    const auto = autoCity.current;
    autoCity.current = null;
    setV((p) => {
      const next = { ...p };
      if (!keepLatLng) { next.lat = ''; next.lng = ''; }
      if (auto !== null && p.city === auto) {
        next.city = '';
        if (!codeEdited) next.store_id = '';
      }
      return next;
    });
    if (auto !== null && v.city === auto && !codeEdited) setSuggested(false);
  }

  async function onPin(pin: string) {
    set('pin', pin);
    const seq = ++pinSeq.current;
    // A new PIN invalidates the old place, coordinates and any city it filled in.
    clearPlace(false);
    if (!/^\d{6}$/.test(pin)) return setLookup('idle');
    setLookup('looking');
    const r = await guard(lookupPin(pin));
    if (seq !== pinSeq.current) return;
    if (!r) return setLookup('idle');
    if (!r.ok) {
      setLookup('not-found');
      setManual(true);
      clearPlace(false);
      return;
    }
    const g = r.geo;
    setLookup('found');
    setManual(false);
    setPlace({
      label: `${g.city}, ${g.state}${g.zone ? ` · ${g.zone} zone` : ''}`,
      sub: `PIN ${g.pin} · ${g.lat.toFixed(2)}° N, ${g.lng.toFixed(2)}° E`,
    });
    setNearest(g.nearest);
    const fillCity = !v.city.trim() || v.city === autoCity.current;
    if (fillCity) autoCity.current = g.city;
    setV((p) => ({ ...p, lat: String(g.lat), lng: String(g.lng), city: fillCity ? g.city : p.city }));
    if (fillCity) suggestCode(g.city);
  }

  /** Typing a coordinate makes the shown place and distances stale until the point is valid and looked up again. */
  function onLatLng(k: 'lat' | 'lng', val: string) {
    set(k, val);
    pointSeq.current++;
    setPlace(null);
    setNearest([]);
  }

  async function onLatLngBlur(k: 'lat' | 'lng') {
    touch(k);
    if (errors.lat || errors.lng) return;
    const seq = ++pointSeq.current;
    const r = await guard(nearestTo(Number(v.lat), Number(v.lng)));
    if (r && seq === pointSeq.current) {
      setNearest(r.nearest);
      setPlace({ label: 'Place set by hand', sub: `PIN ${v.pin} · ${Number(v.lat).toFixed(2)}° N, ${Number(v.lng).toFixed(2)}° E` });
    }
  }

  async function onSubmit() {
    if (!valid || saving || done) return;
    setSaving(true);
    const r = await guard(createStore(toRequest(v)));
    setSaving(false);
    if (!r) return;
    if (!r.ok) {
      const next: Errors = {};
      for (const e of r.errors) next[e.field as keyof FormValues] = e.message;
      setServerErr(next);
      if (next.lat || next.lng) setManual(true);
      return;
    }
    setCreated(r.created);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const tierLabel = TIERS.find((t) => t.value === v.tier)?.label;
  const showLatLng = manual || lookup === 'not-found';

  return (
    <div ref={topRef} className="flex flex-col gap-10 md:gap-12">
      <div>
        <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[42px]">Add a new store</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted">
          Tell us where the store is and how much it can hold. From the next daily run it gets its own stock list, and
          nearby stores can share stock with it.
        </p>
      </div>

      {unavailable && (
        <Banner tone="danger" title="Adding a store is not available right now.">
          We could not reach the server. Nothing was saved. Try again in a few minutes.
        </Banner>
      )}
      {usedFake && !unavailable && (
        <Banner tone="warn" title="Dev only:">
          the API is not running, so these answers come from a local fake. Nothing is saved.
        </Banner>
      )}

      {created && <AddedBanner created={created} />}

      <Section n={1} title="About the store" explainer="Seven things. All are needed.">
        <Card className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          <Field id="city" label="City" error={errOf('city')}>
            <input
              id="city" className={inputCls(!!errOf('city'))} value={v.city} disabled={done} autoComplete="off"
              onChange={(e) => set('city', e.target.value)}
              onBlur={() => { touch('city'); suggestCode(v.city); }}
            />
          </Field>
          <Field
            id="store_id" label="Store code" error={errOf('store_id')}
            hint={suggested && !codeEdited ? 'We suggested the next free code for this city. You can change it.' : 'Three letters, a dash, two numbers. Like ABC-01.'}
          >
            <input
              id="store_id" className={`${inputCls(!!errOf('store_id'))} uppercase`} value={v.store_id} disabled={done} autoComplete="off"
              onChange={(e) => { setCodeEdited(true); set('store_id', e.target.value.toUpperCase()); }}
              onBlur={() => touch('store_id')}
            />
          </Field>
          <Field id="tier" label="Store type" error={errOf('tier')} hint="Sets the display minimum for each category.">
            <select
              id="tier" className={inputCls(!!errOf('tier'))} value={v.tier} disabled={done}
              onChange={(e) => set('tier', e.target.value)} onBlur={() => touch('tier')}
            >
              <option value="">Choose a type</option>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field
            id="capacity" label="Space for stock, in pieces" error={errOf('capacity')}
            hint={`A whole number from ${num(CAPACITY_MIN)} to ${num(CAPACITY_MAX)}. We never plan more than this for the store.`}
          >
            <input
              id="capacity" type="number" inputMode="numeric" min={CAPACITY_MIN} max={CAPACITY_MAX} step={1}
              className={inputCls(!!errOf('capacity'))} value={v.capacity} disabled={done}
              onChange={(e) => set('capacity', e.target.value)} onBlur={() => touch('capacity')}
            />
          </Field>
          <Field id="opened_on" label="Opening date" error={errOf('opened_on')} hint="A future date is fine.">
            <input
              id="opened_on" type="date" className={inputCls(!!errOf('opened_on'))} value={v.opened_on} disabled={done}
              onChange={(e) => set('opened_on', e.target.value)} onBlur={() => touch('opened_on')}
            />
          </Field>
          <Field
            id="pin" label="PIN code" error={errOf('pin')}
            hint={lookup === 'looking' ? 'Looking up this PIN…' : lookup === 'not-found' ? 'We do not know this PIN. Set the place by hand below.' : 'Six digits. We find the place from it.'}
          >
            <input
              id="pin" inputMode="numeric" maxLength={6} className={inputCls(!!errOf('pin'))} value={v.pin} disabled={done} autoComplete="off"
              onChange={(e) => onPin(e.target.value.replace(/\D/g, ''))} onBlur={() => touch('pin')}
            />
          </Field>
          <Field id="address" label="Address" error={errOf('address')} wide>
            <input
              id="address" className={inputCls(!!errOf('address'))} value={v.address} disabled={done}
              onChange={(e) => set('address', e.target.value)} onBlur={() => touch('address')}
            />
          </Field>
        </Card>
      </Section>

      <Section n={2} title="Where it is, and how far from the others" explainer="We work this out from the PIN code. Check that it looks right.">
        <Card padded={false} className="overflow-hidden">
          {lookup === 'idle' && !showLatLng && nearest.length === 0 ? (
            <p className="m-0 px-5 py-6 text-muted md:px-8">Type the PIN code above and we will show the place and how far it is from every store.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-6 md:px-8">
                <div className="flex min-w-0 items-center gap-4">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cta" aria-hidden="true">
                    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-xl font-bold">
                      {lookup === 'looking' ? 'Looking up the PIN…' : place?.label ?? (lookup === 'not-found' ? 'We could not find this PIN' : 'Set the place by hand')}
                    </div>
                    <div className="mt-0.5 text-[15px] text-muted">
                      {place?.sub ?? 'Type a valid latitude and longitude. You can copy them from a map.'}
                    </div>
                  </div>
                </div>
                {!showLatLng && lookup === 'found' && !done && (
                  <button type="button" className="min-h-11 font-semibold text-[#A8340A] underline hover:text-brown" onClick={() => setManual(true)}>
                    Wrong place? Set it by hand
                  </button>
                )}
              </div>
              {showLatLng && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-line px-5 py-6 md:grid-cols-2 md:px-8">
                  <Field id="lat" label="Latitude" error={errOf('lat')} hint="Degrees north, as shown on a map.">
                    <input id="lat" inputMode="decimal" className={inputCls(!!errOf('lat'))} value={v.lat} disabled={done}
                      onChange={(e) => onLatLng('lat', e.target.value)} onBlur={() => onLatLngBlur('lat')} />
                  </Field>
                  <Field id="lng" label="Longitude" error={errOf('lng')} hint="Degrees east, as shown on a map.">
                    <input id="lng" inputMode="decimal" className={inputCls(!!errOf('lng'))} value={v.lng} disabled={done}
                      onChange={(e) => onLatLng('lng', e.target.value)} onBlur={() => onLatLngBlur('lng')} />
                  </Field>
                </div>
              )}
              {nearest.length > 0 && <NearestList rows={nearest} />}
              <div className="border-t border-line px-5 py-4 text-[15px] text-muted md:px-8">
                {TRAVEL_RULE}.{nearest.length > 0 && <span className="block mt-1">{ESTIMATE_NOTE}</span>}
              </div>
            </>
          )}
        </Card>
        <div className="rounded-2xl border-[1.5px] border-line bg-tint/50 px-5 py-4 leading-relaxed md:px-6">
          <span className="font-bold">Why distance matters.</span> When a piece could go to more than one store, the
          closest store that needs it gets it first.
        </div>
      </Section>

      <Section n={3} title="Add it" explainer="Check the summary, then add the store.">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-[20px] bg-brown p-6 text-page shadow-card md:p-9">
          <div className="min-w-0 flex-[1_1_320px]">
            <div className="font-heading text-2xl md:text-[28px]">
              {[v.city.trim() && v.store_id ? `${v.city.trim()} ${v.store_id}` : v.store_id || v.city.trim() || 'New store', tierLabel, v.capacity && !errors.capacity ? `room for ${num(Number(v.capacity))} pieces` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="mt-1.5 leading-relaxed text-tint">
              {v.opened_on && !errors.opened_on ? `Opens ${dateLong(v.opened_on)}. ` : ''}
              It starts with zero stock, so the next daily run plans its opening stock.
            </div>
          </div>
          {done ? (
            <span className="flex h-14 items-center rounded-xl bg-ok-bg px-7 text-lg font-bold text-ok">Added</span>
          ) : (
            <Button className="h-14 px-9 text-lg" disabled={!valid || saving || unavailable} onClick={onSubmit}>
              {saving ? 'Saving…' : 'Add this store'}
            </Button>
          )}
        </div>
        {!valid && !done && (
          <p className="m-0 text-sm text-muted">
            The button turns on when every field above is filled in correctly
            {errors.lat || errors.lng ? ', and the place is found from the PIN or set by hand' : ''}.
          </p>
        )}
      </Section>

      <section className="flex flex-col gap-5 rounded-[20px] bg-ok-bg p-6 text-[#123D2E] md:p-9">
        <h2 className="m-0 font-heading text-2xl font-normal">What happens after you add it</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 leading-snug md:grid-cols-2 lg:grid-cols-4">
          <div><div className="font-bold">It joins the next daily run</div>Marked as a new store for its first {NEW_STORE_DAYS} days</div>
          <div><div className="font-bold">Opening stock is planned</div>From the warehouse first, then the closest stores</div>
          <div><div className="font-bold">Sales are borrowed at first</div>We use similar stores' sales until it has its own</div>
          <div><div className="font-bold">All stock rules apply</div>Space limit and display minimums from day one</div>
        </div>
      </section>
    </div>
  );
}

function AddedBanner({ created }: { created: CreatedStore }) {
  const s = created.store;
  const wh = created.nearest.find((n) => n.location_id === WAREHOUSE_ID);
  const closest = created.nearest.find((n) => n.location_id !== WAREHOUSE_ID);
  return (
    <section role="status" className="flex flex-col gap-2.5 rounded-[20px] bg-ok-bg p-6 text-[#123D2E] md:p-9">
      <div className="font-heading text-2xl md:text-3xl">{storeLabel({ store_id: s.store_id, city: s.city })} is added.</div>
      <p className="m-0 max-w-3xl text-[17px] leading-relaxed">
        It appears in the store list from the next daily run, with zero stock, and that run plans its opening stock.
        {wh ? ` The warehouse is ${wh.travel_days} ${wh.travel_days === 1 ? 'day' : 'days'} away` : ''}
        {wh && closest ? `, and ${closest.city} (${closest.location_id}) is the closest store at ${closest.travel_days} ${closest.travel_days === 1 ? 'day' : 'days'}.` : wh ? '.' : ''}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Link to={`/stores/${s.store_id}`} className="inline-flex min-h-11 items-center font-semibold text-[#123D2E] underline">Open the store page</Link>
        <Link to="/add-stock" className="inline-flex min-h-11 items-center font-semibold text-[#123D2E] underline">Add stock for this store</Link>
      </div>
    </section>
  );
}
