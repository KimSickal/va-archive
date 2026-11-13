import { describe, expect, it } from 'vitest';
import { internalIdBase, romanizeTokens, slugify } from '../scripts/lib/romanize.ts';

describe('romanize (deterministic)', () => {
  it('hangul syllables (RR, no sound change)', () => {
    expect(internalIdBase('정미숙', 'ko')).toBe('jeong-mi-suk');
    expect(internalIdBase('한지우', 'ko')).toBe('han-ji-u');
  });
  it('kana runs (Hepburn, long vowels kept)', () => {
    expect(internalIdBase('チョー', 'ja')).toBe('cho');
    expect(romanizeTokens('ゴン=フリークス', 'ja')).toEqual(['gon', 'furikusu']);
    expect(internalIdBase('きゃりーぱみゅぱみゅ', 'ja')).toBe('kyaripamyupamyu');
    expect(internalIdBase('はっとり', 'ja')).toBe('hattori');
    expect(internalIdBase('まっちゃ', 'ja')).toBe('matcha');
  });
  it('latin', () => {
    expect(internalIdBase('KENN', 'ja')).toBe('kenn');
    expect(slugify('Tōru Furuya')).toBe('toru-furuya');
  });
});
