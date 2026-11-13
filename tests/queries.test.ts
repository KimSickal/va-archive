import { describe, expect, it } from 'vitest';
import {
  castTable,
  compareWithFavorites,
  comparePersons,
  compareWorks,
  personCredits,
  search,
  staleness,
} from '../src/data/queries.ts';
import { fixtureDb } from './helpers.ts';

const { db, issues } = fixtureDb();
/** 표시 ID(slug) ↔ 내부 ID */
const id = (slug: string) => db.idx.personIdBySlug[slug];
const slug = (pid: string) => db.persons[pid].slug;

describe('fixture', () => {
  it('passes validation without errors', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('search', () => {
  it('matches Korean alias and katakana/hiragana', () => {
    expect(search(db, '호시노')[0].entry.id).toBe(id('aoi-hoshino'));
    expect(search(db, 'りん').some((h) => h.entry.id === 'star-knights/rin')).toBe(true);
  });
  it('finds kanji-named persons by furigana reading (hiragana or katakana)', () => {
    expect(search(db, 'ほしの')[0].entry.id).toBe(id('aoi-hoshino'));
    expect(search(db, 'ホシノアオイ')[0].entry.id).toBe(id('aoi-hoshino'));
  });
  it('hides spoiler characters unless exact match, then masks', () => {
    expect(search(db, 'ゼ').some((h) => h.entry.id.endsWith('masked-knight'))).toBe(false);
    const exact = search(db, 'ゼノ').find((h) => h.entry.id.endsWith('masked-knight'));
    expect(exact?.masked).toBe(true);
  });
});

describe('person', () => {
  it('groups multiple roles in one work', () => {
    const g = personCredits(db, id('ren-kurosawa')).find((x) => x.work.id === 'star-knights-s1');
    expect(g?.credits.map((c) => c.credit.character).sort()).toEqual(['kai', 'masked-knight']);
  });
});

describe('work cast table', () => {
  it('puts replaced and replacement VA in the same row, sorted by episode', () => {
    const kai = castTable(db, 'star-knights-s1').find((r) => r.character.id === 'kai')!;
    expect(kai.byVersion[0].map((c) => slug(c.person))).toEqual(['ren-kurosawa', 'taro-yamada']);
  });
  it('orders main before minor', () => {
    const rows = castTable(db, 'star-knights-s1');
    expect(rows[rows.length - 1].role).toBe('minor');
  });
});

describe('compare', () => {
  it('compares works per language only', () => {
    const r = compareWorks(db, 'star-knights-s1', 'moon-cafe');
    const ja = r.find((s) => s.lang === 'ja')!;
    const ko = r.find((s) => s.lang === 'ko')!;
    expect(ja.rows.map((x) => slug(x.person)).sort()).toEqual(['aoi-hoshino', 'ren-kurosawa']);
    expect(ko.rows.map((x) => slug(x.person))).toEqual(['han-ji-woo']);
  });
  it('co-star requires same version by default', () => {
    expect(
      comparePersons(db, id('aoi-hoshino'), id('ren-kurosawa'))
        .map((r) => r.work.id)
        .sort(),
    ).toEqual(['moon-cafe', 'star-knights-s1']);
    expect(comparePersons(db, id('aoi-hoshino'), id('han-ji-woo'))).toEqual([]);
    expect(comparePersons(db, id('aoi-hoshino'), id('han-ji-woo'), { includeOtherVersions: true }).length).toBe(2);
  });
  it('compares with favorite franchises, excluding own franchise', () => {
    const r = compareWithFavorites(db, 'moon-cafe', ['star-knights', 'moon-cafe']);
    const ja = r.find((s) => s.lang === 'ja')!;
    expect(ja.rows.map((x) => x.franchise)).toEqual(['star-knights']);
    // 같은 성우가 프랜차이즈 내 여러 작품에 나오면 모두 포함
    const aoi = ja.rows[0].rows.find((x) => x.person === id('aoi-hoshino'))!;
    expect(aoi.b.map((c) => c.work.id).sort()).toEqual(['star-knights-movie', 'star-knights-s1']);
  });
});

describe('first voiced', () => {
  it('computes per language', () => {
    expect(db.idx.firstVoicedByCharacter['star-knights/rin'].ja.work).toBe('star-knights-s1');
    expect(db.idx.firstVoicedByCharacter['star-knights/rin'].ko.work).toBe('star-knights-s1');
  });
});

describe('staleness', () => {
  it('flags research older than last release', () => {
    expect(staleness(db, 'moon-cafe').kind).toBe('stale'); // researched 2026-10-01, started 2026-10-03
    expect(staleness(db, 'star-knights-s1').kind).toBe('none');
  });
});

import { episodesLabel } from '../src/components/common.tsx';
describe('episodesLabel', () => {
  it('formats ranges', () => {
    expect(episodesLabel({ from: 40, to: 40 })).toBe('40화');
    expect(episodesLabel({ from: 1, to: 6 })).toBe('1–6화');
    expect(episodesLabel({ from: 7 })).toBe('7화~');
    expect(episodesLabel('36-38, 40')).toBe('36-38, 40화');
  });
});

describe('person ids', () => {
  it('URL slug, internal id and old id all resolve to the same person', async () => {
    const { resolveId } = await import('../src/data/queries.ts');
    const pid = id('han-ji-woo');
    expect(resolveId(db, 'persons', 'han-ji-woo')).toBe(pid);
    expect(resolveId(db, 'persons', pid)).toBe(pid);
    expect(resolveId(db, 'persons', 'ji-woo-han')).toBe(pid); // 이전 id (redirects)
  });
});

describe('cross-franchise characters (spin-off / crossover)', () => {
  it('credits in another franchise point to the home character', () => {
    expect(db.idx.franchisesByCharacter['star-knights/rin']).toEqual(['star-knights', 'star-knights-academy']);
    expect(db.idx.guestCharactersByFranchise['star-knights-academy']).toEqual(['star-knights/rin']);
    const row = castTable(db, 'star-knights-academy').find((r) => r.character.id === 'rin')!;
    expect(row.charFranchise).toBe('star-knights');
    expect(db.idx.creditsByCharacter['star-knights/rin'].map((r) => r.work)).toContain('star-knights-academy');
  });
  it('the spin-off is a different franchise for favorites comparison', () => {
    const ja = compareWithFavorites(db, 'star-knights-academy', ['star-knights']).find((s) => s.lang === 'ja')!;
    expect(ja.rows[0].franchise).toBe('star-knights');
  });
});
