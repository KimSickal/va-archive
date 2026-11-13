import type { Franchise, Person, Redirects, Work } from '../types/data';
import type { CreditRef, Db, FirstVoiced, SearchEntry } from './db';
import { maxDate, partialDateStart } from './dates';
import { allNameForms } from './i18n-data';
import { normalize } from './normalize';

export interface BuildInput {
  schemaVersion: string;
  persons: Person[];
  franchises: Franchise[];
  works: Work[];
  redirects: Redirects;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];
const keysOf = (forms: string[]) => uniq(forms.map(normalize).filter(Boolean));

/** 작품 정렬 키: 시작일 → order → id */
export function workSortKey(w: Work): string {
  return `${w.start_date ? partialDateStart(w.start_date) : '9999-99-99'}|${String(w.order ?? 999).padStart(4, '0')}|${w.id}`;
}

function episodeStart(e: unknown): number | undefined {
  if (!e) return undefined;
  if (typeof e === 'object') return (e as { from?: number }).from ?? 1;
  const m = String(e).match(/^\d+/);
  return m ? Number(m[0]) : undefined;
}

export function buildDb(input: BuildInput, builtAt = new Date().toISOString()): Db {
  const strip = <T extends { $schema?: string }>(o: T): T => {
    const { $schema: _s, ...rest } = o;
    return rest as T;
  };
  const persons = Object.fromEntries(input.persons.map((p) => [p.id, strip(p)]));
  const franchises = Object.fromEntries(input.franchises.map((f) => [f.id, strip(f)]));
  const sortedWorks = [...input.works].sort((a, b) => workSortKey(a).localeCompare(workSortKey(b)));
  const works = Object.fromEntries(sortedWorks.map((w) => [w.id, strip(w)]));

  const idx: Db['idx'] = {
    creditsByPerson: {},
    creditsByCharacter: {},
    personsByWorkLang: {},
    personsByFranchiseLang: {},
    worksByPerson: {},
    worksByFranchise: {},
    personIdBySlug: Object.fromEntries(input.persons.map((p) => [p.slug, p.id])),
    lastReleaseByWork: {},
    firstVoicedByCharacter: {},
  };
  const push = <T>(rec: Record<string, T[]>, k: string, v: T) => (rec[k] ??= []).push(v);
  const addSet = (rec: Record<string, Record<string, string[]>>, k: string, lang: string, pid: string) => {
    const l = ((rec[k] ??= {})[lang] ??= []);
    if (!l.includes(pid)) l.push(pid);
  };

  for (const w of sortedWorks) {
    push(idx.worksByFranchise, w.franchise_id, w.id);
    idx.lastReleaseByWork[w.id] =
      maxDate([w.end_date ?? w.start_date, ...w.versions.map((v) => v.last_release_date ?? v.release_date)]) ?? null;
    w.versions.forEach((v, vi) => {
      v.credits.forEach((c, ci) => {
        const ref: CreditRef = {
          work: w.id,
          vi,
          ci,
          lang: v.language,
          franchise: w.franchise_id,
          character: c.character,
          person: c.person,
        };
        push(idx.creditsByPerson, c.person, ref);
        const ck = `${w.franchise_id}/${c.character}`;
        push(idx.creditsByCharacter, ck, ref);
        addSet(idx.personsByWorkLang, w.id, v.language, c.person);
        addSet(idx.personsByFranchiseLang, w.franchise_id, v.language, c.person);
        const wl = (idx.worksByPerson[c.person] ??= []);
        if (!wl.includes(w.id)) wl.push(w.id);
        // 첫 음성 출연: 작품이 정렬되어 있으므로 같은 작품 안에서는 회차가 가장 이른 것
        const fv = (idx.firstVoicedByCharacter[ck] ??= {});
        const cur: FirstVoiced | undefined = fv[v.language];
        const ep = episodeStart(c.episodes);
        if (!cur) fv[v.language] = { work: w.id, vi, ...(ep ? { episode: ep } : {}) };
        else if (cur.work === w.id && (cur.episode ?? 1) > (ep ?? 1))
          fv[v.language] = { work: w.id, vi, ...(ep ? { episode: ep } : {}) };
      });
    });
  }

  const search: SearchEntry[] = [];
  for (const p of input.persons) search.push({ kind: 'person', id: p.id, keys: keysOf(allNameForms(p.name)) });
  for (const w of sortedWorks) search.push({ kind: 'work', id: w.id, keys: keysOf(allNameForms(w.title)) });
  for (const f of input.franchises) {
    search.push({ kind: 'franchise', id: f.id, keys: keysOf(allNameForms(f.title)) });
    for (const c of f.characters) {
      search.push({
        kind: 'character',
        id: `${f.id}/${c.id}`,
        keys: keysOf(allNameForms(c.name)),
        ...(c.spoiler ? { spoiler: true } : {}),
      });
    }
  }

  return {
    schemaVersion: input.schemaVersion,
    builtAt,
    persons,
    franchises,
    works,
    redirects: input.redirects,
    idx,
    search,
  };
}
