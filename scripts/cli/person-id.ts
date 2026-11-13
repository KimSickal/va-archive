/**
 * 새 성우를 만들기 전에 반드시 실행한다 (research-work 스킬).
 * data/ 와 모든 스테이징 루트(.work/research/*\/data)에서 같은 사람 후보를 찾고, 쓸 내부 ID를 알려 준다.
 *
 *   npx tsx scripts/cli/person-id.ts "<원어 표기>" <원어 언어> [--birth YYYY] [--alias "<다른 표기>"]...
 *
 * 출력(JSON):
 *   { action: "reuse", id }          같은 원어 표기 + 출생연도 모순 없음 → 기존 ID를 쓴다 (새 파일 금지)
 *   { action: "create", id }         후보 없음 → 이 ID로 새로 만든다
 *   { action: "conflict", candidates } 판단 불가(동명이인 가능성 등) → 직접 만들지 말고 오케스트레이터에 보고
 *                                      (resolve-conflict 스킬로 중재)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../../src/data/normalize.ts';
import type { Person } from '../../src/types/data.ts';
import { readJson } from '../lib/files.ts';
import { REPO } from '../lib/load.ts';
import { internalIdBase } from '../lib/romanize.ts';

const args = process.argv.slice(2);
const [original, lang] = args;
if (!original || !lang) {
  console.error('usage: person-id.ts "<original>" <lang> [--birth YYYY] [--alias "<form>"]...');
  process.exit(2);
}
const birth = args.includes('--birth') ? args[args.indexOf('--birth') + 1] : undefined;
const aliases = args.flatMap((a, i) => (a === '--alias' ? [args[i + 1]] : []));

const roots = [join(REPO, 'data')];
const research = join(REPO, '.work', 'research');
if (existsSync(research)) for (const d of readdirSync(research)) roots.push(join(research, d, 'data'));

interface Cand {
  id: string;
  slug: string;
  original: string;
  birth?: string;
  root: string;
  match: 'original' | 'alias';
}
const keys = new Set([original, ...aliases].map(normalize));
const base = internalIdBase(original, lang);
const taken = new Set<string>();
const cands = new Map<string, Cand>();
for (const root of roots) {
  const dir = join(root, 'persons');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = readJson<Person>(join(dir, f));
    taken.add(p.id);
    const forms = [
      p.name.original,
      ...Object.values(p.name.official ?? {}),
      ...Object.values(p.name.aliases ?? {}).flat(),
    ];
    const hit = forms.map(normalize).find((k) => keys.has(k));
    if (!hit) continue;
    const match = normalize(p.name.original) === normalize(original) ? 'original' : 'alias';
    const prev = cands.get(p.id);
    if (!prev || (prev.match === 'alias' && match === 'original'))
      cands.set(p.id, {
        id: p.id,
        slug: p.slug,
        original: p.name.original,
        birth: p.birth,
        root: root.replace(REPO + '/', ''),
        match,
      });
  }
}
const year = (d?: string) => d?.slice(0, 4);
const compatible = [...cands.values()].filter((c) => !birth || !year(c.birth) || year(c.birth) === birth);
const exact = compatible.filter((c) => c.match === 'original');

let out: object;
if (exact.length === 1 && compatible.length === 1) out = { action: 'reuse', id: exact[0].id, candidate: exact[0] };
else if (cands.size === 0 || compatible.length === 0) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  out = {
    action: 'create',
    id,
    note:
      compatible.length === 0 && cands.size
        ? '같은 표기의 성우가 있지만 출생연도가 달라 다른 사람으로 본다'
        : undefined,
    candidates: cands.size ? [...cands.values()] : undefined,
  };
} else out = { action: 'conflict', base, candidates: [...cands.values()] };
console.log(JSON.stringify(out, null, 2));
