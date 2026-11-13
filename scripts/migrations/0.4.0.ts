/**
 * 스키마 0.3.1 → 0.4.0 마이그레이션 (1회성)
 *
 *   npx tsx scripts/migrations/0.4.0.ts --root <data 루트> [--archive <회차 보관 파일>] [--map <ID 대응표 파일>] [--dry-run]
 *
 * 1. --archive: 지우기 전에 Credit.episodes 와 Character.first_appearance.episode 를 보관 파일로 뽑는다
 *    (이전/새 캐릭터 ID, 캐릭터·성우 원어 표기, 출처 URL 포함 — 사이트 빌드에는 쓰이지 않음)
 * 2. 캐릭터 ID를 규칙대로 다시 만든다: 원어 표기 → 결정적 로마자 변환(scripts/lib/romanize.ts),
 *    프랜차이즈 안에서 겹치면 characters 배열 순서대로 -2, -3 …
 *    works 의 credit.character, decisions 의 subjects 를 함께 바꾼다. --map 에 (프랜차이즈/이전 → 새) 대응표를 쓴다
 * 3. Credit.episodes, Character.first_appearance.episode 를 지운다
 * 4. 회차로만 구분되던 배역이 (캐릭터, 성우, part) 기준으로 겹치면 하나로 합친다
 *    (source_refs 합집합, role 은 높은 쪽, note 가 다르면 첫 쪽을 남기고 보고)
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Credit, Decision, Franchise, Person, Role, Work } from '../../src/types/data.ts';
import { readJson, writeJson } from '../lib/files.ts';
import { characterIdBase } from '../lib/ids.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const root = opt('--root');
if (!root) throw new Error('--root 필요');
const archivePath = opt('--archive');
const mapPath = opt('--map');
const dry = args.includes('--dry-run');

const list = <T>(d: string): { file: string; obj: T }[] => {
  const dir = join(root, d);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: join(dir, f), obj: readJson<T>(join(dir, f)) }));
};
const franchises = list<Franchise>('franchises');
const works = list<Work & { versions: { credits: (Credit & { episodes?: unknown })[] }[] }>('works');
const decisions = list<Decision>('decisions');
const persons = new Map(list<Person>('persons').map(({ obj }) => [obj.id, obj]));

// ---- 2. 캐릭터 ID 대응 ----
const idMap = new Map<string, string>(); // "franchise/old" → new
const charInfo = new Map<string, { original: string; new: string }>();
for (const { obj: fr } of franchises) {
  const used = new Set<string>();
  for (const c of fr.characters) {
    const base = characterIdBase(c.name);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    idMap.set(`${fr.id}/${c.id}`, id);
    charInfo.set(`${fr.id}/${c.id}`, { original: c.name.original, new: id });
  }
}
const mapRef = (ref: string, home: string): string => {
  const [f, c] = ref.includes('/') ? ref.split('/') : [home, ref];
  const next = idMap.get(`${f}/${c}`);
  if (!next) {
    console.warn(`  ! 대응 없는 캐릭터 참조 ${f}/${c} (그대로 둠)`);
    return ref;
  }
  return ref.includes('/') ? `${f}/${next}` : next;
};

// ---- 1. 보관 ----
const archive: {
  credits: unknown[];
  first_appearance: unknown[];
} = { credits: [], first_appearance: [] };
for (const { obj: w } of works) {
  const src = new Map(w.sources.map((s) => [s.id, s.url]));
  for (const v of w.versions)
    for (const c of v.credits) {
      if (c.episodes === undefined) continue;
      const [f, ch] = c.character.includes('/') ? c.character.split('/') : [w.franchise_id, c.character];
      archive.credits.push({
        work: w.id,
        version: v.id,
        franchise: f,
        character_old_id: ch,
        character_id: idMap.get(`${f}/${ch}`) ?? ch,
        character: charInfo.get(`${f}/${ch}`)?.original,
        person: c.person,
        person_name: persons.get(c.person)?.name.original,
        part: c.part ?? 'regular',
        episodes: c.episodes,
        sources: c.source_refs.map((r) => src.get(r) ?? r),
      });
    }
}
for (const { obj: fr } of franchises)
  for (const c of fr.characters) {
    const ep = (c.first_appearance as { episode?: number } | undefined)?.episode;
    if (ep === undefined) continue;
    archive.first_appearance.push({
      franchise: fr.id,
      character_old_id: c.id,
      character_id: idMap.get(`${fr.id}/${c.id}`),
      character: c.name.original,
      work: c.first_appearance!.work,
      episode: ep,
    });
  }

// ---- 2~4 적용 ----
const ROLE: Record<Role, number> = { main: 0, supporting: 1, minor: 2 };
let changedIds = 0;
let stripped = 0;
let faStripped = 0;
let merged = 0;
for (const { file, obj: fr } of franchises) {
  for (const c of fr.characters) {
    const next = idMap.get(`${fr.id}/${c.id}`)!;
    if (next !== c.id) changedIds++;
    c.id = next;
    const fa = c.first_appearance as { work: string; episode?: number } | undefined;
    if (fa && fa.episode !== undefined) {
      delete fa.episode;
      faStripped++;
    }
  }
  if (!dry) writeJson(file, fr);
}
for (const { file, obj: w } of works) {
  for (const v of w.versions) {
    const out: Credit[] = [];
    const seen = new Map<string, Credit>();
    for (const c of v.credits) {
      c.character = mapRef(c.character, w.franchise_id);
      if (c.episodes !== undefined) {
        delete c.episodes;
        stripped++;
      }
      const key = JSON.stringify([c.character, c.person, c.part ?? 'regular']);
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, c);
        out.push(c);
        continue;
      }
      merged++;
      prev.source_refs = [...new Set([...prev.source_refs, ...c.source_refs])];
      if (ROLE[c.role] < ROLE[prev.role]) prev.role = c.role;
      if (c.note && JSON.stringify(c.note) !== JSON.stringify(prev.note)) {
        if (!prev.note) prev.note = c.note;
        else console.warn(`  ! ${w.id}/${v.id} ${c.character}×${c.person}: 합친 배역의 note 가 다름 — 첫 쪽 유지`);
      }
      if (c.verification && c.verification !== prev.verification)
        console.warn(
          `  ! ${w.id}/${v.id} ${c.character}×${c.person}: 합친 배역의 verification 이 다름 (${prev.verification ?? '-'} / ${c.verification})`,
        );
    }
    v.credits = out;
  }
  if (!dry) writeJson(file, w);
}
for (const { file, obj: d } of decisions) {
  let touched = false;
  for (const s of d.subjects) {
    if (s.kind !== 'character') continue;
    const next = mapRef(s.id, '');
    if (next !== s.id) {
      // 서술 안의 같은 참조도 함께 바꾼다
      for (const k of ['decision', 'rationale'] as const) d[k] = d[k].split(s.id).join(next);
      s.id = next;
      touched = true;
    }
  }
  if (touched && !dry) writeJson(file, d);
}

console.log(
  `${root}: 캐릭터 ID ${changedIds}/${idMap.size} 변경, 배역 회차 ${stripped}건·첫 등장 회차 ${faStripped}건 삭제, 겹친 배역 ${merged}건 병합`,
);
if (!dry && archivePath) {
  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, JSON.stringify(archive, null, 2) + '\n');
  console.log(`보관: ${archivePath} (배역 ${archive.credits.length}, 첫 등장 ${archive.first_appearance.length})`);
}
if (!dry && mapPath) {
  const m: Record<string, string> = {};
  for (const [k, v] of idMap) m[k] = `${k.split('/')[0]}/${v}`;
  writeFileSync(mapPath, JSON.stringify(m, null, 2) + '\n');
}
