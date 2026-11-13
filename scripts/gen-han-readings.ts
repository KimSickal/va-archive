/**
 * Unihan(고정 버전)에서 한자 글자별 읽기 표를 만든다 → scripts/data/han-readings.json (커밋함)
 *
 *   npx tsx scripts/gen-han-readings.ts            # 인터넷 필요 (unicode.org, 약 7MB)
 *
 * - ja: kJapaneseOn(음독)의 첫 번째 읽기, 없으면 kJapaneseKun(훈독)의 첫 번째 읽기 (음독이 짧고 일정해 ID가 간결)
 * - zh: kMandarin의 첫 번째 읽기 (성조 제거)
 * 내부 ID 생성의 결정성을 위해 UNICODE_VERSION은 고정한다. 바꾸면 ROMANIZER_VERSION도 올린다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HAN_TABLE_PATH } from './lib/romanize.ts';

const UNICODE_VERSION = '16.0.0';
const URL_ZIP = `https://www.unicode.org/Public/${UNICODE_VERSION}/ucd/Unihan.zip`;

const dir = mkdtempSync(join(tmpdir(), 'unihan-'));
try {
  const res = await fetch(URL_ZIP, { headers: { 'User-Agent': 'va-archive-data-tool/0.1' } });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const zip = join(dir, 'Unihan.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zip, 'Unihan_Readings.txt', '-d', dir]);
  const lines = readFileSync(join(dir, 'Unihan_Readings.txt'), 'utf8').split('\n');
  const kun: Record<string, string> = {};
  const on: Record<string, string> = {};
  const zh: Record<string, string> = {};
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  for (const line of lines) {
    if (!line.startsWith('U+')) continue;
    const [cp, field, value] = line.split('\t');
    const ch = String.fromCodePoint(parseInt(cp.slice(2), 16));
    const first = clean(value.trim().split(/\s+/)[0]);
    if (!first) continue;
    if (field === 'kJapaneseKun') kun[ch] = first;
    else if (field === 'kJapaneseOn') on[ch] = first;
    else if (field === 'kMandarin') zh[ch] = first;
  }
  const ja = { ...kun, ...on };
  writeFileSync(HAN_TABLE_PATH, JSON.stringify({ source: `Unihan ${UNICODE_VERSION}`, ja, zh }));
  console.log(`wrote ${HAN_TABLE_PATH}: ja ${Object.keys(ja).length}, zh ${Object.keys(zh).length}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
