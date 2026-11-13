/**
 * 조회·비교 로직. 모두 (db, args) => result 형태의 순수 함수 (docs/02-architecture.md 4절).
 */
import type { Character, Credit, Version, Work } from '../types/data';
import { partialDateEnd } from './dates';
import type { CreditRef, Db, SearchEntry } from './db';
import { langOrder } from './i18n-data';
import { normalize } from './normalize';

// ---------- 기본 조회 ----------

export interface ResolvedCredit {
  ref: CreditRef;
  work: Work;
  version: Version;
  credit: Credit;
  character: Character | undefined;
}

export function resolveCredit(db: Db, ref: CreditRef): ResolvedCredit {
  const work = db.works[ref.work];
  const version = work.versions[ref.vi];
  const credit = version.credits[ref.ci];
  const character = db.franchises[ref.franchise]?.characters.find((c) => c.id === ref.character);
  return { ref, work, version, credit, character };
}

export function getCharacter(db: Db, franchiseId: string, characterId: string): Character | undefined {
  return db.franchises[franchiseId]?.characters.find((c) => c.id === characterId);
}

/** URL 파라미터 → 내부 ID. 성우는 표시 ID(slug) → 내부 ID → 리다이렉트 순으로 찾는다 */
export function resolveId(db: Db, kind: 'persons' | 'works' | 'franchises', id: string): string | undefined {
  if (kind === 'persons' && db.idx.personIdBySlug[id]) return db.idx.personIdBySlug[id];
  if (db[kind][id]) return id;
  const to = db.redirects[kind]?.[id];
  return to && db[kind][to] ? to : undefined;
}

/** 성우 페이지 경로 (URL에는 표시 ID를 쓴다) */
export const personPath = (db: Db, id: string) => `/person/${db.persons[id]?.slug ?? id}`;

export const ROLE_RANK = { main: 0, supporting: 1, minor: 2 } as const;

// ---------- 검색 ----------

export interface SearchHit {
  entry: SearchEntry;
  score: number;
  /** 스포일러 캐릭터가 정확히 일치해 노출된 경우 */
  masked: boolean;
}

export function search(
  db: Db,
  query: string,
  opts: { kinds?: SearchEntry['kind'][]; limit?: number } = {},
): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const e of db.search) {
    if (opts.kinds && !opts.kinds.includes(e.kind)) continue;
    let score = 0;
    for (const k of e.keys) {
      const s = k === q ? 3 : k.startsWith(q) ? 2 : k.includes(q) ? 1 : 0;
      if (s > score) score = s;
    }
    if (!score) continue;
    if (e.spoiler) {
      // 스포일러 캐릭터: 자동완성에서 제외, 정확히 일치할 때만 가린 채 노출
      if (score < 3) continue;
      hits.push({ entry: e, score, masked: true });
    } else hits.push({ entry: e, score, masked: false });
  }
  const kindRank = { person: 0, work: 1, franchise: 2, character: 3 };
  hits.sort((a, b) => b.score - a.score || kindRank[a.entry.kind] - kindRank[b.entry.kind]);
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

// ---------- 성우 페이지 ----------

export interface PersonWorkGroup {
  work: Work;
  credits: ResolvedCredit[];
}

/** 성우의 출연작: 작품별 그룹, 최신 작품 먼저 */
export function personCredits(db: Db, personId: string): PersonWorkGroup[] {
  const groups = new Map<string, PersonWorkGroup>();
  for (const ref of db.idx.creditsByPerson[personId] ?? []) {
    const rc = resolveCredit(db, ref);
    const g = groups.get(ref.work) ?? { work: rc.work, credits: [] };
    g.credits.push(rc);
    groups.set(ref.work, g);
  }
  const order = Object.keys(db.works); // 빌드 시 오래된 순으로 정렬됨
  return [...groups.values()].sort((a, b) => order.indexOf(b.work.id) - order.indexOf(a.work.id));
}

// ---------- 작품 페이지: 캐스팅 표 ----------

export interface CastRow {
  character: Character;
  /** 가장 높은 역할 */
  role: Credit['role'];
  /** version index → 배역들 (회차 순) */
  byVersion: Record<number, Credit[]>;
}

export function castTable(db: Db, workId: string): CastRow[] {
  const work = db.works[workId];
  const fr = db.franchises[work.franchise_id];
  const rows = new Map<string, CastRow & { firstSeen: number }>();
  let seq = 0;
  work.versions.forEach((v, vi) => {
    for (const c of v.credits) {
      const character = fr.characters.find((ch) => ch.id === c.character);
      if (!character) continue;
      const row = rows.get(c.character) ?? { character, role: c.role, byVersion: {}, firstSeen: seq++ };
      if (ROLE_RANK[c.role] < ROLE_RANK[row.role]) row.role = c.role;
      (row.byVersion[vi] ??= []).push(c);
      rows.set(c.character, row);
    }
  });
  const epStart = (c: Credit) =>
    typeof c.episodes === 'object'
      ? (c.episodes.from ?? 0)
      : c.episodes
        ? Number(String(c.episodes).match(/^\d+/)?.[0] ?? 0)
        : 0;
  for (const r of rows.values())
    for (const list of Object.values(r.byVersion)) list.sort((a, b) => epStart(a) - epStart(b));
  return [...rows.values()]
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _f, ...r }) => r);
}

// ---------- 비교 ----------

export interface OverlapRow {
  person: string;
  a: ResolvedCredit[];
  b: ResolvedCredit[];
}
export interface LangSection<T> {
  lang: string;
  rows: T[];
}

function creditsIn(db: Db, personId: string, pred: (r: CreditRef) => boolean): ResolvedCredit[] {
  return (db.idx.creditsByPerson[personId] ?? []).filter(pred).map((r) => resolveCredit(db, r));
}

/** 작품 2개 비교: 같은 언어끼리만, 언어별 섹션 */
export function compareWorks(db: Db, a: string, b: string): LangSection<OverlapRow>[] {
  const la = db.idx.personsByWorkLang[a] ?? {};
  const lb = db.idx.personsByWorkLang[b] ?? {};
  const langs = [...new Set([...Object.keys(la), ...Object.keys(lb)])].sort(langOrder);
  return langs.map((lang) => {
    const setB = new Set(lb[lang] ?? []);
    const common = (la[lang] ?? []).filter((p) => setB.has(p));
    return {
      lang,
      rows: common.map((p) => ({
        person: p,
        a: creditsIn(db, p, (r) => r.work === a && r.lang === lang),
        b: creditsIn(db, p, (r) => r.work === b && r.lang === lang),
      })),
    };
  });
}

export interface CoStarRow {
  work: Work;
  a: ResolvedCredit[];
  b: ResolvedCredit[];
  /** 같은 버전(음성 트랙)에 함께 출연했는지 */
  sameVersion: boolean;
}

/** 성우 2명 비교: 공동 출연 작품 */
export function comparePersons(
  db: Db,
  a: string,
  b: string,
  opts: { includeOtherVersions?: boolean } = {},
): CoStarRow[] {
  const wb = new Set(db.idx.worksByPerson[b] ?? []);
  const rows: CoStarRow[] = [];
  for (const wid of db.idx.worksByPerson[a] ?? []) {
    if (!wb.has(wid)) continue;
    const ca = creditsIn(db, a, (r) => r.work === wid);
    const cb = creditsIn(db, b, (r) => r.work === wid);
    const va = new Set(ca.map((c) => c.ref.vi));
    const sameVersion = cb.some((c) => va.has(c.ref.vi));
    if (!sameVersion && !opts.includeOtherVersions) continue;
    rows.push({ work: db.works[wid], a: ca, b: cb, sameVersion });
  }
  const order = Object.keys(db.works);
  return rows.sort((x, y) => order.indexOf(y.work.id) - order.indexOf(x.work.id));
}

export interface FavoriteOverlap {
  franchise: string;
  rows: OverlapRow[];
}

/** 현재 작품 vs 즐겨찾기 프랜차이즈들 (현재 작품의 프랜차이즈는 제외), 언어별 섹션 */
export function compareWithFavorites(
  db: Db,
  workId: string,
  favoriteFranchises: string[],
): LangSection<FavoriteOverlap>[] {
  const work = db.works[workId];
  const here = db.idx.personsByWorkLang[workId] ?? {};
  const targets = favoriteFranchises.filter((f) => f !== work.franchise_id && db.franchises[f]);
  const latest = (fid: string) => {
    const ws = db.idx.worksByFranchise[fid] ?? [];
    const s = ws.map((w) => db.works[w].start_date).filter(Boolean) as string[];
    return s.map(partialDateEnd).sort().pop() ?? '';
  };
  return Object.keys(here)
    .sort(langOrder)
    .map((lang) => {
      const mine = here[lang];
      const sections: FavoriteOverlap[] = [];
      for (const fid of targets) {
        const theirs = new Set(db.idx.personsByFranchiseLang[fid]?.[lang] ?? []);
        const common = mine.filter((p) => theirs.has(p));
        if (!common.length) continue;
        sections.push({
          franchise: fid,
          rows: common.map((p) => ({
            person: p,
            a: creditsIn(db, p, (r) => r.work === workId && r.lang === lang),
            b: creditsIn(db, p, (r) => r.franchise === fid && r.lang === lang),
          })),
        });
      }
      sections.sort((x, y) => y.rows.length - x.rows.length || latest(y.franchise).localeCompare(latest(x.franchise)));
      return { lang, rows: sections };
    });
}

// ---------- 재조사 안내 ----------

export type Staleness =
  | { kind: 'stale'; researchedAt: string; lastRelease: string }
  | { kind: 'ongoing'; researchedAt: string }
  | { kind: 'none'; researchedAt: string };

/** docs/04-data-build.md 5절 */
export function staleness(db: Db, workId: string): Staleness {
  const w = db.works[workId];
  const researchedAt = w.meta.researched_at;
  const last = db.idx.lastReleaseByWork[workId];
  if (last && researchedAt < partialDateEnd(last)) {
    // 마지막 공개일이 미래(방영 예정 포함)면 "진행 중"으로 본다
    const today = new Date().toISOString().slice(0, 10);
    if (partialDateEnd(last) <= today || !['airing', 'live_service', 'announced'].includes(w.status))
      return { kind: 'stale', researchedAt, lastRelease: last };
  }
  if (['airing', 'live_service', 'announced'].includes(w.status)) return { kind: 'ongoing', researchedAt };
  return { kind: 'none', researchedAt };
}
