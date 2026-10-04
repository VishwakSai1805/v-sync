import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// Pages show failed loads through this (the toast system registers itself).
let reportError = () => {};
export const setApiErrorReporter = (fn) => { reportError = fn; };

// Fetch helper: const { data, loading, error, reload } = useApi('/issues');
// `loading` stays true until data has arrived, so a page never renders with
// data === null (e.g. when a request fails because the session just ended).
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!path) {
      setBusy(false);
      return;
    }
    const call = ++latest.current; // ignore responses that arrive after a newer request started
    setBusy(true);
    try {
      const res = await api.get(path);
      if (call !== latest.current) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (call !== latest.current) return;
      setError(e.message);
      // A 401 already signs the user out; anything else is worth telling them.
      if (e.status !== 401) reportError(e.message);
    } finally {
      if (call === latest.current) setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  const loading = Boolean(path) && (busy || data === null);
  return { data, loading, error, reload, setData };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
