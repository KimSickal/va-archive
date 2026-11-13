/**
 * 내부 ID용 결정적 로마자 변환 (docs/03-data-model.md "성우 ID").
 *
 * 목표는 "정확한 읽기"가 아니라 "같은 입력 → 항상 같은 출력"이다.
 * - 한글: 국어의 로마자 표기법 (음운 변화 미적용, 음절 단위)
 * - 가나: 헵번식 (장음은 그대로: おう → ou)
 * - 라틴: 악센트 제거·소문자
 * - 한자: scripts/data/han-readings.json (Unihan 고정 버전에서 생성)의 글자별 첫 번째 읽기
 *
 * 변환 규칙이나 읽기 표가 바뀌면 같은 이름에서 다른 ID가 나오므로 ROMANIZER_VERSION을 올리고,
 * 기존 ID는 다시 계산하지 않는다 (ID는 불변).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROMANIZER_VERSION = 1;

// ---------- 한글 ----------
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
];
const JONG = [
  '',
  'k',
  'k',
  'k',
  'n',
  'n',
  'n',
  't',
  'l',
  'k',
  'm',
  'l',
  'l',
  'l',
  'p',
  'l',
  'm',
  'p',
  'p',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
];

function hangulSyllable(c: string): string | null {
  const code = c.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
}

// ---------- 가나 ----------
const KANA: Record<string, string> = {};
(() => {
  const rows: [string, string[]][] = [
    ['あいうえお', ['a', 'i', 'u', 'e', 'o']],
    ['かきくけこ', ['ka', 'ki', 'ku', 'ke', 'ko']],
    ['さしすせそ', ['sa', 'shi', 'su', 'se', 'so']],
    ['たちつてと', ['ta', 'chi', 'tsu', 'te', 'to']],
    ['なにぬねの', ['na', 'ni', 'nu', 'ne', 'no']],
    ['はひふへほ', ['ha', 'hi', 'fu', 'he', 'ho']],
    ['まみむめも', ['ma', 'mi', 'mu', 'me', 'mo']],
    ['やゆよ', ['ya', 'yu', 'yo']],
    ['らりるれろ', ['ra', 'ri', 'ru', 're', 'ro']],
    ['わゐゑを', ['wa', 'i', 'e', 'o']],
    ['がぎぐげご', ['ga', 'gi', 'gu', 'ge', 'go']],
    ['ざじずぜぞ', ['za', 'ji', 'zu', 'ze', 'zo']],
    ['だぢづでど', ['da', 'ji', 'zu', 'de', 'do']],
    ['ばびぶべぼ', ['ba', 'bi', 'bu', 'be', 'bo']],
    ['ぱぴぷぺぽ', ['pa', 'pi', 'pu', 'pe', 'po']],
    ['ぁぃぅぇぉゃゅょゎ', ['a', 'i', 'u', 'e', 'o', 'ya', 'yu', 'yo', 'wa']],
  ];
  for (const [chars, roma] of rows) [...chars].forEach((c, i) => (KANA[c] = roma[i]));
  KANA['ん'] = 'n';
  KANA['ゔ'] = 'vu';
})();
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function kanaRun(run: string): string {
  const s = toHira(run);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (c === 'っ') {
      const r = next ? kanaRun(next) : '';
      out += r.startsWith('ch') ? 't' : (r[0] ?? '');
      continue;
    }
    if (c === 'ー') continue;
    let r = KANA[c] ?? '';
    // 拗音: きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja
    if (next && YOON[next] && r.endsWith('i') && r.length > 1) {
      const base = r.slice(0, -1);
      r = (base === 'sh' || base === 'ch' || base === 'j' ? base : base + 'y') + YOON[next];
      i++;
    } else if (next && 'ぁぃぅぇぉ'.includes(next) && r.length > 1) {
      // ファ・ティ 등 외래어 표기: 모음 교체
      r = r.slice(0, -1).replace(/^(f|t|d|v|w|sh|ch|j)$/, '$1') + KANA[next];
      i++;
    }
    out += r;
  }
  return out;
}

// ---------- 한자 ----------
type HanTable = { ja: Record<string, string>; zh: Record<string, string>; source: string };
let han: HanTable | null | undefined;
export const HAN_TABLE_PATH = process.env.VA_HAN_TABLE ?? join(import.meta.dirname, '..', 'data', 'han-readings.json');
function hanTable(): HanTable | null {
  if (han === undefined) han = existsSync(HAN_TABLE_PATH) ? JSON.parse(readFileSync(HAN_TABLE_PATH, 'utf8')) : null;
  return han ?? null;
}
export const hanTableAvailable = () => hanTable() !== null;

export class MissingHanTableError extends Error {
  constructor() {
    super(
      'scripts/data/han-readings.json 이 없습니다. `npx tsx scripts/gen-han-readings.ts`로 생성하세요 (인터넷 필요).',
    );
  }
}

const isHan = (c: string) => /[㐀-鿿豈-﫿\u{20000}-\u{2ffff}]/u.test(c);
const isKana = (c: string) => /[ぁ-ゖァ-ヶーゝゞヽヾ]/.test(c);

/** 원어 표기 → 로마자 토큰 목록 */
export function romanizeTokens(original: string, lang: string): string[] {
  const s = original.normalize('NFKC');
  const tokens: string[] = [];
  let kana = '';
  let latin = '';
  const flush = () => {
    if (kana) tokens.push(kanaRun(kana));
    if (latin) tokens.push(latin);
    kana = '';
    latin = '';
  };
  for (const c of s) {
    if (isKana(c)) {
      if (latin) flush();
      kana += c;
      continue;
    }
    if (/[A-Za-z0-9À-ɏ]/.test(c)) {
      if (kana) flush();
      latin += c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      continue;
    }
    flush();
    const h = hangulSyllable(c);
    if (h !== null) tokens.push(h);
    else if (isHan(c)) {
      const t = hanTable();
      if (!t) throw new MissingHanTableError();
      const table = lang.startsWith('zh') || lang === 'yue' ? t.zh : t.ja;
      tokens.push(table[c] ?? t.zh[c] ?? t.ja[c] ?? `u${c.codePointAt(0)!.toString(16)}`);
    }
    // 그 밖의 문자(공백·중점·기호)는 구분자로 취급
  }
  flush();
  return tokens.filter(Boolean);
}

/** 내부 ID의 기본형 (동명이인 번호 제외) */
export function internalIdBase(original: string, lang: string): string {
  return slugify(romanizeTokens(original, lang).join('-'));
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
