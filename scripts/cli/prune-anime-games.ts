/**
 * 애니 원작 게임 규칙(docs/03 5절 "애니 원작 게임의 배역")을 기존 데이터에 기계적으로 적용한다.
 *
 *   npx tsx scripts/cli/prune-anime-games.ts --root <수정할 data 루트> [--ref <참조만 할 루트>]... [--archive <보관 파일>] [--dry-run]
 *
 * 적용 대상: 프랜차이즈의 첫 애니 공개 뒤에 출시된 게임 (날짜가 애매하면 적용하지 않음)
 * 각 게임 버전(언어 L)의 배역 중
 *   - assumption(추정)이 붙은 배역은 지운다
 *   - 다른 프랜차이즈 캐릭터 참조(게스트·크로스오버)는 남긴다
 *   - 그 캐릭터의, 게임 출시 전 마지막 애니 작품(같은 언어)의 성우에 포함되면 지운다
 *   - 그 밖(다른 성우, 게임 오리지널, 그 게임이 첫 음성)은 남긴다
 * 적용한 게임에는 cast_follows_anime: true 를 붙인다. 지운 배역은 --archive 파일에 모은다(기존 파일이면 이어 붙임).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Credit, Franchise, Person, Work } from '../../src/types/data.ts';
import { readJson, writeJson } from '../lib/files.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const root = opt('--root');
if (!root) throw new Error('--root 필요');
const refs = args.flatMap((a, i) => (args[i - 1] === '--ref' ? [a] : []));
const archivePath = opt('--archive');
const dry = args.includes('--dry-run');

const load = <T>(r: string, d: string) =>
  existsSync(join(r, d))
    ? readdirSync(join(r, d))
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ file: join(r, d, f), obj: readJson<T>(join(r, d, f)) }))
    : [];
// 수정 대상 루트가 참조 루트보다 우선 (같은 id면 수정 대상 것을 쓴다)
const works = new Map<string, { file: string; obj: Work; own: boolean }>();
for (const r of refs) for (const x of load<Work>(r, 'works')) works.set(x.obj.id, { ...x, own: false });
for (const x of load<Work>(root, 'works')) works.set(x.obj.id, { ...x, own: true });
const persons = new Map<string, Person>();
for (const r of [...refs, root]) for (const x of load<Person>(r, 'persons')) persons.set(x.obj.id, x.obj);
const chars = new Map<string, string>();
for (const r of [...refs, root])
  for (const x of load<Franchise>(r, 'franchises'))
    for (const c of x.obj.characters) chars.set(`${x.obj.id}/${c.id}`, c.name.original);

const lo = (d: string) => (d + '-01-01').slice(0, 10); // 부분 날짜의 가장 이른 날
const hi = (d: string) => (d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d);

const byFr = new Map<string, Work[]>();
for (const { obj } of works.values()) byFr.set(obj.franchise_id, [...(byFr.get(obj.franchise_id) ?? []), obj]);

const archived: unknown[] = [];
const report: Record<string, unknown>[] = [];
for (const [fid, ws] of byFr) {
  const anime = ws
    .filter((w) => w.type !== 'game' && w.start_date)
    .sort((a, b) => lo(a.start_date!).localeCompare(lo(b.start_date!)));
  if (!anime.length) continue;
  const firstAnime = hi(anime[0].start_date!);
  for (const g of ws.filter((w) => w.type === 'game')) {
    const entry = works.get(g.id)!;
    if (!entry.own) continue;
    if (!g.start_date || lo(g.start_date) <= firstAnime) {
      report.push({
        work: g.id,
        applied: false,
        why: g.start_date ? 'first anime not before release' : 'no start_date',
      });
      continue;
    }
    const before = anime.filter((a) => hi(a.start_date!) < lo(g.start_date!));
    const src = new Map(g.sources.map((s) => [s.id, s.url]));
    let kept = 0,
      dropped = 0,
      assumed = 0;
    for (const v of g.versions) {
      // 캐릭터 → 게임 출시 전 마지막 애니 작품의 성우 집합
      const lastVa = new Map<string, Set<string>>();
      for (const a of before)
        for (const av of a.versions) {
          if (av.language !== v.language) continue;
          const here = new Map<string, Set<string>>();
          for (const c of av.credits) {
            const key = c.character.includes('/') ? c.character : `${a.franchise_id}/${c.character}`;
            (here.get(key) ?? here.set(key, new Set()).get(key)!).add(c.person);
          }
          for (const [k, s] of here) lastVa.set(k, s); // 시간순이므로 나중 작품이 덮어쓴다
        }
      const out: Credit[] = [];
      for (const c of v.credits) {
        const cross = c.character.includes('/') && !c.character.startsWith(`${fid}/`);
        const key = c.character.includes('/') ? c.character : `${fid}/${c.character}`;
        const same = lastVa.get(key)?.has(c.person);
        const drop = !cross && (c.assumption !== undefined || same);
        if (!drop) {
          out.push(c);
          kept++;
          continue;
        }
        dropped++;
        if (c.assumption) assumed++;
        archived.push({
          work: g.id,
          version: v.id,
          franchise: fid,
          character: key,
          character_name: chars.get(key),
          person: c.person,
          person_name: persons.get(c.person)?.name.original,
          role: c.role,
          ...(c.part ? { part: c.part } : {}),
          ...(c.assumption ? { assumption: c.assumption } : {}),
          reason: c.assumption ? 'assumed' : 'same_as_anime',
          sources: c.source_refs.map((r) => src.get(r) ?? r),
        });
      }
      v.credits = out;
    }
    g.cast_follows_anime = true;
    report.push({ work: g.id, applied: true, kept, dropped, assumed_dropped: assumed });
    if (!dry) writeJson(entry.file, g);
  }
}
console.table(report);
const tot = report.reduce((a: number, r) => a + ((r.dropped as number) ?? 0), 0);
console.log(`dropped ${tot} credits${dry ? ' (dry run)' : ''}`);
if (!dry && archivePath) {
  const prev = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, 'utf8')).credits : [];
  writeFileSync(archivePath, JSON.stringify({ credits: [...prev, ...archived] }, null, 2) + '\n');
  console.log(`archived → ${archivePath}`);
}
