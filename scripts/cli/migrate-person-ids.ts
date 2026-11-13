/**
 * 성우 내부 ID를 규칙(원어 표기 → 결정적 로마자 + 동명이인 번호)으로 일괄 재생성한다. 1회성 마이그레이션.
 *
 *   npx tsx scripts/cli/migrate-person-ids.ts [--root data] [--dry-run]
 *
 * - 파일 이름, works 의 credit.person, decisions 의 subjects, redirects.persons 값을 함께 바꾼다
 * - 이전 id가 현재 slug와 다르면 redirects.persons 에 (이전 id → 새 id)를 남긴다 (즐겨찾기 호환)
 * - 끝나면 data/schema/PERSON_ID_SCHEME 을 romanized-v1 로 바꾼다
 * 같은 기본형이 여럿이면(원어 표기가 같은 사람들) 기존 id 순으로 base, base-2, … 를 준다.
 * 이런 경우는 중복 의심이므로 먼저 resolve-conflict 로 같은 사람인지 확정해야 한다.
 */
import { readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Decision, Person, Work } from '../../src/types/data.ts';
import { readJson, readRedirects, writeJson, writeRedirects } from '../lib/files.ts';
import { REPO, SCHEMA_DIR } from '../lib/load.ts';
import { internalIdBase, ROMANIZER_VERSION } from '../lib/romanize.ts';

const args = process.argv.slice(2);
const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : join(REPO, 'data');
const dry = args.includes('--dry-run');
const pdir = join(root, 'persons');

const persons = readdirSync(pdir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson<Person>(join(pdir, f)));
const groups = new Map<string, Person[]>();
for (const p of persons) {
  const b = internalIdBase(p.name.original, p.name.original_lang);
  groups.set(b, [...(groups.get(b) ?? []), p]);
}
const map = new Map<string, string>();
for (const [b, g] of groups) {
  g.sort((x, y) => x.id.localeCompare(y.id));
  g.forEach((p, i) => map.set(p.id, i === 0 ? b : `${b}-${i + 1}`));
  if (g.length > 1) console.warn(`같은 기본형 ${b}: ${g.map((p) => p.id).join(', ')} — 동명이인/중복 확인 필요`);
}
const changed = [...map].filter(([a, b]) => a !== b);
console.log(`${changed.length}/${persons.length} ids change (romanizer v${ROMANIZER_VERSION})`);
for (const [a, b] of changed.slice(0, 15)) console.log(`  ${a} → ${b}`);
if (dry) process.exit(0);

const redirects = readRedirects(root);
const slugs = new Set(persons.map((p) => p.slug));
for (const p of persons) {
  const next = map.get(p.id)!;
  const old = p.id;
  p.id = next;
  writeJson(join(pdir, `${old}.json`), p);
  if (old !== next) {
    renameSync(join(pdir, `${old}.json`), join(pdir, `${next}.json`));
    if (!slugs.has(old)) redirects.persons[old] = next;
  }
}
for (const [k, v] of Object.entries(redirects.persons)) redirects.persons[k] = map.get(v) ?? v;
writeRedirects(root, redirects);

const wdir = join(root, 'works');
for (const f of readdirSync(wdir).filter((x) => x.endsWith('.json'))) {
  const w = readJson<Work>(join(wdir, f));
  for (const v of w.versions) for (const c of v.credits) c.person = map.get(c.person) ?? c.person;
  writeJson(join(wdir, f), w);
}
try {
  const ddir = join(root, 'decisions');
  for (const f of readdirSync(ddir).filter((x) => x.endsWith('.json'))) {
    const d = readJson<Decision>(join(ddir, f));
    for (const s of d.subjects) if (s.kind === 'person') s.id = map.get(s.id) ?? s.id;
    writeJson(join(ddir, f), d);
  }
} catch {
  /* decisions 없음 */
}
if (root === join(REPO, 'data')) writeFileSync(join(SCHEMA_DIR, 'PERSON_ID_SCHEME'), 'romanized-v1\n');
console.log('done');
