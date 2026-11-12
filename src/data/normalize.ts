/** 검색·중복 판별용 이름 정규화. 빌드 스크립트와 브라우저가 같은 함수를 쓴다. */

const VARIANTS: Record<string, string> = {
  﨑: '崎',
  髙: '高',
  邊: '辺',
  邉: '辺',
  澤: '沢',
  濱: '浜',
  齋: '斎',
  齊: '斉',
  斎: '斉',
  嶋: '島',
  槇: '槙',
};

export function normalize(input: string): string {
  let s = input.normalize('NFKC').toLowerCase();
  // 가타카나 → 히라가나
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  s = s.replace(/./gu, (c) => VARIANTS[c] ?? c);
  // 공백·중점·하이픈·구두점 제거
  s = s.replace(/[\s・·•\-‐‑–—_.,'"’“”!?！？:：;；()（）[\]【】「」『』〈〉<>~〜ー=＝/\\]/g, '');
  return s;
}
