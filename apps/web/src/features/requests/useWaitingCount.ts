import { useEffect, useState } from 'react';
import { getMe, listRequests } from './api';

/** For the sidebar Requests badge (#78): asks from other stores still waiting for this store's answer. */
export function useWaitingCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => (me.store_id ? listRequests(me.store_id, 'incoming') : []))
      .then((rows) => alive && setN(rows.filter((r) => r.status === 'waiting').length))
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return n;
}
