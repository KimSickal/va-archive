/**
 * 성우 표시 ID(slug)를 규칙대로 다시 계산해 파일에 반영한다. 바뀐 slug는 redirects.persons 에 남긴다.
 *
 *   npx tsx scripts/cli/assign-slugs.ts [--root data] [--dry-run]
 *
 * 이전 slug는 그 slug를 원래 쓰던 사람(내부 id)에게 리다이렉트한다 (예전 링크가 가리키던 사람).
 */
import { join } from 'node:path';
import type { Person } from '../../src/types/data.ts';
import { expectedSlugs, personIdScheme } from '../lib/ids.ts';
import { readJson, readRedirects, writeJson, writeRedirects } from '../lib/files.ts';
import { loadDataset, REPO, type Issue } from '../lib/load.ts';
import { internalIdBase } from '../lib/romanize.ts';

const args = process.argv.slice(2);
const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : join(REPO, 'data');
const dry = args.includes('--dry-run');

const issues: Issue[] = [];
const ds = loadDataset([root], issues);
const persons = [...ds.persons.values()];
const base =
  personIdScheme() === 'legacy' ? undefined : (p: Person) => internalIdBase(p.name.original, p.name.original_lang);
const exp = expectedSlugs(persons, base);
const redirects = readRedirects(root);
const live = new Set(exp.values());
let changed = 0;
for (const p of persons) {
  const next = exp.get(p.id)!;
  if (next === p.slug) continue;
  changed++;
  console.log(`${p.id}: ${p.slug} → ${next}`);
  if (dry) continue;
  const file = join(REPO, ds.files.get(`persons:${p.id}`)!);
  const obj = readJson<Person>(file);
  // 이전 slug가 누군가의 내부 id 이기도 하면 화면이 내부 id로도 찾아가므로 리다이렉트가 필요 없다
  if (!live.has(p.slug) && !ds.persons.has(p.slug)) redirects.persons[p.slug] = p.id;
  obj.slug = next;
  writeJson(file, obj);
}
// 이제 다시 사용되는 slug는 리다이렉트에서 뺀다
for (const k of Object.keys(redirects.persons)) if (live.has(k)) delete redirects.persons[k];
if (!dry && changed) writeRedirects(root, redirects);
console.log(`${changed} slug(s) ${dry ? 'would change' : 'updated'}`);
