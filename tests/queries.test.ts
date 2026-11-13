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

describe('fixture', () => {
  it('passes validation without errors', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('search', () => {
  it('matches Korean alias and katakana/hiragana', () => {
    expect(search(db, '호시노')[0].entry.id).toBe('aoi-hoshino');
    expect(search(db, 'りん').some((h) => h.entry.id === 'star-knights/rin')).toBe(true);
  });
  it('finds kanji-named persons by furigana reading (hiragana or katakana)', () => {
    expect(search(db, 'ほしの')[0].entry.id).toBe('aoi-hoshino');
    expect(search(db, 'ホシノアオイ')[0].entry.id).toBe('aoi-hoshino');
  });
  it('hides spoiler characters unless exact match, then masks', () => {
    expect(search(db, 'ゼ').some((h) => h.entry.id.endsWith('masked-knight'))).toBe(false);
    const exact = search(db, 'ゼノ').find((h) => h.entry.id.endsWith('masked-knight'));
    expect(exact?.masked).toBe(true);
  });
});

describe('person', () => {
  it('groups multiple roles in one work', () => {
    const g = personCredits(db, 'ren-kurosawa').find((x) => x.work.id === 'star-knights-s1');
    expect(g?.credits.map((c) => c.credit.character).sort()).toEqual(['kai', 'masked-knight']);
  });
});

describe('work cast table', () => {
  it('puts replaced and replacement VA in the same row, sorted by episode', () => {
    const kai = castTable(db, 'star-knights-s1').find((r) => r.character.id === 'kai')!;
    expect(kai.byVersion[0].map((c) => c.person)).toEqual(['ren-kurosawa', 'taro-yamada']);
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
    expect(ja.rows.map((x) => x.person).sort()).toEqual(['aoi-hoshino', 'ren-kurosawa']);
    expect(ko.rows.map((x) => x.person)).toEqual(['ji-woo-han']);
  });
  it('co-star requires same version by default', () => {
    expect(
      comparePersons(db, 'aoi-hoshino', 'ren-kurosawa')
        .map((r) => r.work.id)
        .sort(),
    ).toEqual(['moon-cafe', 'star-knights-s1']);
    expect(comparePersons(db, 'aoi-hoshino', 'ji-woo-han')).toEqual([]);
    expect(comparePersons(db, 'aoi-hoshino', 'ji-woo-han', { includeOtherVersions: true }).length).toBe(2);
  });
  it('compares with favorite franchises, excluding own franchise', () => {
    const r = compareWithFavorites(db, 'moon-cafe', ['star-knights', 'moon-cafe']);
    const ja = r.find((s) => s.lang === 'ja')!;
    expect(ja.rows.map((x) => x.franchise)).toEqual(['star-knights']);
    // 같은 성우가 프랜차이즈 내 여러 작품에 나오면 모두 포함
    const aoi = ja.rows[0].rows.find((x) => x.person === 'aoi-hoshino')!;
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
