import { useSyncExternalStore } from 'react';
import { createStore } from './storage';

/** docs/05-frontend.md 8절 */
export interface FavoriteEntry {
  id: string;
  addedAt: string;
}
export interface Favorites {
  version: 1;
  updatedAt: string;
  franchises: FavoriteEntry[];
  persons: FavoriteEntry[];
}
export type FavoriteKind = 'franchises' | 'persons';

const KEY = 'va-archive:favorites';
const empty = (): Favorites => ({ version: 1, updatedAt: new Date(0).toISOString(), franchises: [], persons: [] });

export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return empty();
  try {
    return validateFavorites(JSON.parse(raw));
  } catch {
    return empty();
  }
}

/** 가져오기 파일 검증. 형식이 틀리면 예외 */
export function validateFavorites(x: unknown): Favorites {
  const o = x as Partial<Favorites>;
  if (!o || typeof o !== 'object' || o.version !== 1)
    throw new Error('지원하지 않는 즐겨찾기 형식입니다 (version 1 필요).');
  const list = (v: unknown, name: string): FavoriteEntry[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`${name} 목록이 배열이 아닙니다.`);
    return v.map((e) => {
      if (!e || typeof e.id !== 'string') throw new Error(`${name} 항목에 id가 없습니다.`);
      return { id: e.id, addedAt: typeof e.addedAt === 'string' ? e.addedAt : new Date().toISOString() };
    });
  };
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    franchises: list(o.franchises, 'franchises'),
    persons: list(o.persons, 'persons'),
  };
}

export function mergeFavorites(a: Favorites, b: Favorites): Favorites {
  const m = (x: FavoriteEntry[], y: FavoriteEntry[]) => {
    const map = new Map(x.map((e) => [e.id, e]));
    for (const e of y) if (!map.has(e.id)) map.set(e.id, e);
    return [...map.values()];
  };
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    franchises: m(a.franchises, b.franchises),
    persons: m(a.persons, b.persons),
  };
}

export const favoritesStore = createStore<Favorites>(KEY, parseFavorites, (v) => JSON.stringify(v));

export function useFavorites(): Favorites {
  return useSyncExternalStore(favoritesStore.subscribe, favoritesStore.get);
}

export function isFavorite(f: Favorites, kind: FavoriteKind, id: string): boolean {
  return f[kind].some((e) => e.id === id);
}

export function toggleFavorite(kind: FavoriteKind, id: string): void {
  const f = favoritesStore.get();
  const now = new Date().toISOString();
  const list = isFavorite(f, kind, id) ? f[kind].filter((e) => e.id !== id) : [...f[kind], { id, addedAt: now }];
  favoritesStore.set({ ...f, updatedAt: now, [kind]: list });
}
