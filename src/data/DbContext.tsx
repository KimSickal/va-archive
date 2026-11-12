import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Db, Manifest } from './db';

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; db: Db; manifest: Manifest };

const Ctx = createContext<Db | null>(null);

export function DbProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (s: State, retry: () => void) => ReactNode;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const base = import.meta.env.BASE_URL;
      const mres = await fetch(`${base}data/manifest.json`, { cache: 'no-cache' });
      if (!mres.ok) throw new Error(`manifest ${mres.status}`);
      const manifest = (await mres.json()) as Manifest;
      const dres = await fetch(`${base}data/${manifest.db}`);
      if (!dres.ok) throw new Error(`db ${dres.status}`);
      setState({ status: 'ready', db: (await dres.json()) as Db, manifest });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (state.status !== 'ready') return <>{fallback(state, load)}</>;
  return <Ctx.Provider value={state.db}>{children}</Ctx.Provider>;
}

export function useDb(): Db {
  const db = useContext(Ctx);
  if (!db) throw new Error('useDb outside DbProvider');
  return db;
}
