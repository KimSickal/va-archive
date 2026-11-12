import type { Name, Text } from '../types/data';

export type Locale = 'ko' | 'ja' | 'en';

/** docs/03-data-model.md 2.4절 표시 규칙 */
export function nameIn(n: Name, locale: Locale): { text: string; isOriginal: boolean; official: boolean } {
  if (n.original_lang === locale) return { text: n.original, isOriginal: true, official: true };
  const off = n.official?.[locale];
  if (off) return { text: off, isOriginal: false, official: true };
  const alias = n.aliases?.[locale]?.[0];
  if (alias) return { text: alias, isOriginal: false, official: false };
  return { text: n.original, isOriginal: true, official: true };
}

export function displayName(n: Name, locale: Locale = 'ko'): string {
  return nameIn(n, locale).text;
}

/** 표시명과 다른 원어/로마자 보조 표기 */
export function subName(n: Name, locale: Locale = 'ko'): string {
  const main = nameIn(n, locale);
  const parts: string[] = [];
  if (!main.isOriginal) parts.push(n.original);
  if (n.latin !== main.text && n.latin !== n.original) parts.push(n.latin);
  return parts.join(' · ');
}

export function textIn(t: Text, locale: Locale): { text: string; translated: boolean; original: string } {
  if (t.original_lang === locale) return { text: t.original, translated: false, original: t.original };
  const tr = t.translations?.[locale];
  if (tr) return { text: tr, translated: t.translated?.includes(locale) ?? false, original: t.original };
  return { text: t.original, translated: false, original: t.original };
}

export function displayText(t: Text, locale: Locale = 'ko'): string {
  return textIn(t, locale).text;
}

/** Name의 모든 표기 (검색 키용) */
export function allNameForms(n: Name): string[] {
  return [n.original, n.latin, ...Object.values(n.official ?? {}), ...Object.values(n.aliases ?? {}).flat()];
}

const LANG_LABEL: Record<string, string> = {
  ja: '일본어',
  ko: '한국어',
  en: '영어',
  'zh-Hans': '중국어(간체)',
  'zh-Hant': '중국어(번체)',
  yue: '광둥어',
};
export const langLabel = (tag: string) => LANG_LABEL[tag] ?? tag;

/** 언어 섹션 정렬: ja → ko → en → 기타(알파벳순) */
export function langOrder(a: string, b: string): number {
  const rank = (t: string) => ['ja', 'ko', 'en'].indexOf(t);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  return a.localeCompare(b);
}
