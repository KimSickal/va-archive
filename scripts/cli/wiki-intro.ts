/**
 * 위키백과 문서의 도입부(첫 문단)를 일괄로 가져온다. 후리가나·활동명·별명의 근거 확인용.
 *
 *   npx tsx scripts/cli/wiki-intro.ts <url>...            # 위키백과 문서 URL들 (언어판 섞여도 됨)
 *   npx tsx scripts/cli/wiki-intro.ts --json <url>...     # JSON 출력 ({url, title, intro, reading})
 *
 * 요청은 scripts/lib/http.ts(사이트별 공용 속도 제한 + 캐시)를 거친다.
 * reading: 일본어판 도입부 "漢字 名前（よみ がな、…" 패턴에서 뽑은 후리가나 (공백 제거, 없으면 null)
 */
import { politeFetch } from '../lib/http.ts';

const args = process.argv.slice(2);
const asJson = args[0] === '--json';
const urls = asJson ? args.slice(1) : args;

export interface Intro {
  url: string;
  title: string;
  intro: string;
  reading: string | null;
}

/** 일본어 위키백과 도입부에서 후리가나를 뽑는다 */
export function extractReading(intro: string): string | null {
  const m = intro.match(/^[^（(\n]{1,40}[（(]([ぁ-ゖゔァ-ヶー・\s　]+)[、,，）)]/);
  if (!m) return null;
  // 가타카나가 섞인 읽기(예: くぼ ユリカ)는 히라가나로 통일
  const r = m[1].replace(/[\s　・]/g, '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return r.length >= 2 ? r : null;
}

async function fetchBatch(lang: string, titles: string[]): Promise<Map<string, string>> {
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&exlimit=20&titles=${encodeURIComponent(titles.join('|'))}`;
  const res = await politeFetch(api);
  if (res.status !== 200) throw new Error(`${lang} API ${res.status}`);
  const j = JSON.parse(res.body) as {
    query: {
      pages: { title: string; extract?: string }[];
      redirects?: { from: string; to: string }[];
      normalized?: { from: string; to: string }[];
    };
  };
  const out = new Map<string, string>();
  const alias = new Map<string, string>();
  for (const r of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) alias.set(r.from, r.to);
  const byTitle = new Map(j.query.pages.map((p) => [p.title, p.extract ?? '']));
  for (const t of titles) {
    let k = t;
    for (let i = 0; i < 3 && alias.has(k); i++) k = alias.get(k)!;
    out.set(t, byTitle.get(k) ?? '');
  }
  return out;
}

export async function fetchIntros(list: string[]): Promise<Intro[]> {
  const byLang = new Map<string, string[]>();
  for (const u of list) {
    const url = new URL(u);
    const lang = url.hostname.split('.')[0];
    const title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
    byLang.set(lang, [...(byLang.get(lang) ?? []), title]);
  }
  const results: Intro[] = [];
  for (const [lang, titles] of byLang) {
    for (let i = 0; i < titles.length; i += 20) {
      const batch = titles.slice(i, i + 20);
      const map = await fetchBatch(lang, batch);
      for (const t of batch) {
        const intro = map.get(t) ?? '';
        results.push({
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`,
          title: t,
          intro,
          reading: lang === 'ja' ? extractReading(intro) : null,
        });
      }
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}` && urls.length) {
  const res = await fetchIntros(urls);
  if (asJson) console.log(JSON.stringify(res, null, 2));
  else
    for (const r of res) console.log(`${r.title}\t${r.reading ?? '-'}\t${r.intro.slice(0, 120).replace(/\n/g, ' ')}`);
}
