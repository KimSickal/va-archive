/**
 * 캐릭터 ID를 규칙대로 계산한다 (docs/03-data-model.md 4.2절). researcher 가 캐릭터를 추가하기 전에 실행한다.
 *
 *   npx tsx scripts/cli/character-id.ts "<원어 표기>" <원어 언어> [--franchise <id>] [--root <data 루트>]...
 *
 * --franchise 를 주면 data/ 와 지정한 루트(없으면 .work/research/*\/data)의 그 프랜차이즈 파일을 확인해
 *   - 같은 원어 표기의 캐릭터가 있으면  `existing <id>` (같은 캐릭터인지 확인하고, 같으면 재사용)
 *   - 없으면 겹치지 않는 다음 ID         `new <id>`
 * 를 출력한다. --franchise 가 없으면 기본형만 출력한다.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Franchise } from '../../src/types/data.ts';
import { readJson } from '../lib/files.ts';
import { characterIdBase } from '../lib/ids.ts';
import { REPO } from '../lib/load.ts';

const args = process.argv.slice(2);
const [original, lang] = args;
if (!original || !lang) {
  console.error('사용법: character-id.ts "<원어 표기>" <원어 언어> [--franchise <id>] [--root <data 루트>]...');
  process.exit(2);
}
const base = characterIdBase({ original_lang: lang, original });
const fid = args.includes('--franchise') ? args[args.indexOf('--franchise') + 1] : undefined;
if (!fid) {
  console.log(base);
  process.exit(0);
}
const roots = args.flatMap((a, i) => (args[i - 1] === '--root' ? [a] : []));
if (!roots.length) {
  roots.push(join(REPO, 'data'));
  const rdir = join(REPO, '.work', 'research');
  if (existsSync(rdir)) for (const d of readdirSync(rdir)) roots.push(join(rdir, d, 'data'));
} else if (!roots.includes(join(REPO, 'data'))) roots.unshift(join(REPO, 'data'));

const used = new Set<string>();
for (const r of roots) {
  const f = join(r, 'franchises', `${fid}.json`);
  if (!existsSync(f)) continue;
  for (const c of readJson<Franchise>(f).characters) {
    used.add(c.id);
    if (c.name.original === original) {
      console.log(`existing ${c.id}  (${f})`);
      process.exit(0);
    }
  }
}
let id = base;
for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
console.log(`new ${id}`);
