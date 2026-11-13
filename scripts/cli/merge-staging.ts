/**
 * 스테이징 데이터를 data/로 병합한다.
 *
 *   npx tsx scripts/cli/merge-staging.ts .work/research/a/data .work/research/b/data
 *   npx tsx scripts/cli/merge-staging.ts --out .work/preview/data <roots...>   # data/ 대신 다른 곳에 출력
 *   --keep : 병합 후 스테이징을 보관 폴더(.work/archive/)로 옮기지 않는다
 * data/ 로 병합하면 각 스테이징 루트(<root>/..)를 .work/archive/<이름>-<날짜>/ 로 옮긴다.
 * 병합된 스테이징이 남아 있으면 person-id 조회가 같은 사람을 중복 후보로 잡기 때문이다.
 *
 * - works / franchises: 그대로 복사 (같은 id가 data/에 있으면 덮어씀 — 갱신 모드)
 * - persons: 같은 id가 여러 곳에 있으면 병합
 *     · 출처를 합치고 id를 s1..로 다시 매김 (image.source_ref도 갱신)
 *     · official / aliases / wikipedia / links 합집합
 *     · 그 밖의 필드는 먼저 나온 값 유지, 값이 서로 다르면 충돌로 보고
 *     · meta: researched_at은 최신, 검증 상태는 가장 낮은 것
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Person, Source, VerificationStatus } from '../../src/types/data.ts';
import { REPO } from '../lib/load.ts';

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
if (keep) argv.splice(argv.indexOf('--keep'), 1);
const outIdx = argv.indexOf('--out');
const DATA = outIdx >= 0 ? argv.splice(outIdx, 2)[1] : join(REPO, 'data');
const roots = argv;
if (!roots.length) {
  console.error('usage: merge-staging.ts <staging-data-root>...');
  process.exit(1);
}

const read = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const write = (p: string, o: unknown) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
const conflicts: string[] = [];
const RANK: VerificationStatus[] = ['disputed', 'unverified', 'user_confirmed', 'verified'];

function mergePerson(a: Person, b: Person): Person {
  // 출처 병합 (url 기준 중복 제거), b의 source id → 새 id 매핑
  const sources: Source[] = [];
  const mapA = new Map<string, string>();
  const mapB = new Map<string, string>();
  const add = (s: Source, map: Map<string, string>) => {
    const existing = sources.find((x) => x.url === s.url);
    if (existing) return map.set(s.id, existing.id);
    const id = `s${sources.length + 1}`;
    sources.push({ ...s, id });
    map.set(s.id, id);
  };
  a.sources.forEach((s) => add(s, mapA));
  b.sources.forEach((s) => add(s, mapB));

  const out: Person = { ...a, sources: sources as Person['sources'] };
  for (const k of ['gender', 'nationality', 'birth', 'death', 'agencies', 'debut_year'] as const) {
    const va = a[k];
    const vb = b[k];
    const o = out as unknown as Record<string, unknown>;
    if (va === undefined && vb !== undefined) o[k] = vb;
    // 날짜: 정밀도만 다르고 모순이 없으면 더 정밀한 값을 쓴다 (1980 vs 1980-05-08)
    else if (typeof va === 'string' && typeof vb === 'string' && (va.startsWith(vb) || vb.startsWith(va)))
      o[k] = va.length >= vb.length ? va : vb;
    else if (va !== undefined && vb !== undefined && JSON.stringify(va) !== JSON.stringify(vb))
      conflicts.push(`persons/${a.id}.${k}: ${JSON.stringify(va)} vs ${JSON.stringify(vb)} (먼저 나온 값 유지)`);
  }
  if (a.image) out.image = { ...a.image, source_ref: mapA.get(a.image.source_ref)! };
  else if (b.image) out.image = { ...b.image, source_ref: mapB.get(b.image.source_ref)! };

  const official = { ...(b.name.official ?? {}), ...(a.name.official ?? {}) };
  const aliases: Record<string, string[]> = {};
  for (const src of [a.name.aliases, b.name.aliases])
    for (const [l, list] of Object.entries(src ?? {})) aliases[l] = [...new Set([...(aliases[l] ?? []), ...list])];
  out.name = {
    ...a.name,
    ...(Object.keys(official).length ? { official } : {}),
    ...(Object.keys(aliases).length ? { aliases } : {}),
  };
  if (a.name.original !== b.name.original || a.name.latin !== b.name.latin)
    conflicts.push(
      `persons/${a.id}.name: ${a.name.original}/${a.name.latin ?? '-'} vs ${b.name.original}/${b.name.latin ?? '-'}`,
    );
  const wiki = { ...(b.wikipedia ?? {}), ...(a.wikipedia ?? {}) };
  if (Object.keys(wiki).length) out.wikipedia = wiki;
  const links = [...(a.links ?? []), ...(b.links ?? []).filter((l) => !(a.links ?? []).some((x) => x.url === l.url))];
  if (links.length) out.links = links;

  const sa = a.meta.verification.status;
  const sb = b.meta.verification.status;
  const status = RANK[Math.min(RANK.indexOf(sa), RANK.indexOf(sb))];
  out.meta = {
    ...a.meta,
    researched_at: a.meta.researched_at > b.meta.researched_at ? a.meta.researched_at : b.meta.researched_at,
    verification: {
      status,
      ...(status === 'verified' || status === 'user_confirmed'
        ? {
            verified_at: [a.meta.verification.verified_at, b.meta.verification.verified_at]
              .filter(Boolean)
              .sort()
              .pop(),
          }
        : {}),
    },
  };
  return out;
}

const persons = new Map<string, Person>();
let copied = 0;
for (const kind of ['persons', 'franchises', 'works'] as const) mkdirSync(join(DATA, kind), { recursive: true });
for (const f of readdirSync(join(DATA, 'persons')))
  persons.set(f.replace(/\.json$/, ''), read(join(DATA, 'persons', f)));
const before = new Set(persons.keys());

for (const root of roots) {
  for (const kind of ['franchises', 'works'] as const) {
    const dir = join(root, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      write(join(DATA, kind, f), read(join(dir, f)));
      copied++;
    }
  }
  const pdir = join(root, 'persons');
  if (!existsSync(pdir)) continue;
  for (const f of readdirSync(pdir).filter((x) => x.endsWith('.json'))) {
    const p = read<Person>(join(pdir, f));
    persons.set(p.id, persons.has(p.id) ? mergePerson(persons.get(p.id)!, p) : p);
  }
}
for (const p of persons.values()) write(join(DATA, 'persons', `${p.id}.json`), p);
console.log(`copied ${copied} work/franchise files; persons: ${persons.size} (${persons.size - before.size} new)`);
if (conflicts.length) {
  console.log(`\n${conflicts.length} conflicts:`);
  for (const c of conflicts) console.log('  ' + c);
}

if (!keep && DATA === join(REPO, 'data')) {
  const archive = join(REPO, '.work', 'archive');
  mkdirSync(archive, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  for (const root of roots) {
    const stage = dirname(root); // .work/research/<key>
    const to = join(archive, `${basename(stage)}-${day}`);
    if (existsSync(stage) && !existsSync(to)) {
      renameSync(stage, to);
      console.log(`archived ${stage} → ${to}`);
    }
  }
}
