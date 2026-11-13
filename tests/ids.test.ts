import { describe, expect, it } from 'vitest';
import { expectedSlugs } from '../scripts/lib/ids.ts';
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
