import { describe, expect, it } from 'vitest';
import { characterIdBase, expectedSlugs } from '../scripts/lib/ids.ts';
import { allNameForms, nameIn, subName } from '../src/data/i18n-data.ts';
import type { Person } from '../src/types/data.ts';

const P = (id: string, latin: string, birth?: string): Person =>
  ({ id, slug: '', name: { original_lang: 'ja', original: id, latin }, ...(birth ? { birth } : {}) }) as Person;

describe('display slug rule: {name}[-{birthYear|0000}[-{index}]]', () => {
  it('no suffix without homonyms', () => {
    expect(expectedSlugs([P('a', 'Kana Hanazawa')]).get('a')).toBe('kana-hanazawa');
  });
  it('birth year (or 0000) for homonyms', () => {
    const s = expectedSlugs([P('a', 'Yu Hayashi', '1985-02'), P('b', 'Yu Hayashi')]);
    expect(s.get('a')).toBe('yu-hayashi-1985');
    expect(s.get('b')).toBe('yu-hayashi-0000');
  });
  it('same year → internal homonym number', () => {
    const s = expectedSlugs([P('x', 'Yu Hayashi', '1985'), P('x-2', 'Yu Hayashi', '1985')], () => 'x');
    expect(s.get('x')).toBe('yu-hayashi-1985-1');
    expect(s.get('x-2')).toBe('yu-hayashi-1985-2');
  });
  it('same year, different originals (both #1) → order of internal id', () => {
    const s = expectedSlugs([P('b-id', 'Yu Hayashi'), P('a-id', 'Yu Hayashi')], (p) => p.id);
    expect(s.get('a-id')).toBe('yu-hayashi-0000-1');
    expect(s.get('b-id')).toBe('yu-hayashi-0000-2');
  });
});

describe('optional latin (schema 0.4.0)', () => {
  it('person without latin uses internal id as slug', () => {
    const p = { id: 'kitsu-sen-ma-mi', slug: '', name: { original_lang: 'ja', original: '吉川麻美' } } as Person;
    expect(expectedSlugs([p]).get('kitsu-sen-ma-mi')).toBe('kitsu-sen-ma-mi');
  });
  it('subName skips missing latin', () => {
    expect(subName({ original_lang: 'ja', original: '瑠羽', official: { ko: '루우' } })).toBe('瑠羽');
  });
});

describe('character id rule', () => {
  it('is the deterministic romanization of the original name', () => {
    expect(characterIdBase({ original_lang: 'ja', original: '役名なし 1' })).toBe('yaku-mei-nashi-1');
    expect(characterIdBase({ original_lang: 'ja', original: '？？？' })).toBe('character');
  });
});

describe('translated names (schema 0.5.0)', () => {
  it('official > aliases > translated > original', () => {
    const n = { original_lang: 'ja', original: '呪術廻戦 懐玉・玉折', translated: { ko: '주술회전 회옥·옥절' } };
    expect(nameIn(n, 'ko')).toMatchObject({ text: '주술회전 회옥·옥절', translated: true });
    expect(nameIn({ ...n, aliases: { ko: ['회옥옥절'] } }, 'ko').translated).toBe(false);
    expect(nameIn({ ...n, official: { ko: '주술회전 2기' } }, 'ko').text).toBe('주술회전 2기');
    expect(allNameForms(n)).toContain('주술회전 회옥·옥절');
  });
});
