import { partialDateEnd, partialDateStart } from '../../src/data/dates.ts';
import { normalize } from '../../src/data/normalize.ts';
import type { Image, Name, Source, Text, Wikipedia, Work } from '../../src/types/data.ts';
import type { Dataset, Issue } from './load.ts';

/** JSON Schema로 표현할 수 없는 규칙 (docs/03-data-model.md 7절) */
export function checkIntegrity(ds: Dataset, issues: Issue[]): void {
  const err = (file: string, message: string) => issues.push({ level: 'error', file, message });
  const warn = (file: string, message: string) => issues.push({ level: 'warning', file, message });

  const fileOf = (kind: string, id: string) => ds.files.get(`${kind}:${id}`) ?? `${kind}/${id}`;

  // ---- 공통: 출처·다국어·이미지·위키 검사 ----
  const checkSources = (file: string, sources: Source[]) => {
    const ids = new Set<string>();
    for (const s of sources) {
      if (ids.has(s.id)) err(file, `출처 id 중복: ${s.id}`);
      ids.add(s.id);
    }
    return new Map(sources.map((s) => [s.id, s]));
  };
  const checkRefs = (file: string, where: string, refs: string[] | undefined, src: Map<string, Source>) => {
    for (const r of refs ?? []) if (!src.has(r)) err(file, `${where}: 존재하지 않는 출처 ${r}`);
  };
  const checkImage = (file: string, where: string, img: Image | undefined, src: Map<string, Source>) => {
    if (!img) return;
    const s = src.get(img.source_ref);
    if (!s) err(file, `${where}.image: 존재하지 않는 출처 ${img.source_ref}`);
    else if (s.tier > 2) err(file, `${where}.image: 출처 ${s.id}의 등급이 ${s.tier} (1~2만 허용)`);
  };
  const checkWiki = (file: string, where: string, w: Wikipedia | undefined) => {
    for (const [k, url] of Object.entries(w ?? {})) {
      const sub = new URL(url).hostname.split('.')[0];
      if (sub !== k) err(file, `${where}.wikipedia: 키 ${k}와 URL 언어판 ${sub} 불일치`);
    }
  };
  const checkTag = (file: string, where: string, tag: string) => {
    if (/^zh(-|$)/.test(tag) && !/^zh-(Hans|Hant)/.test(tag))
      err(file, `${where}: 중국어 태그 ${tag}에 문자 표기(Hans/Hant) 필요`);
  };
  const checkName = (file: string, where: string, n: Name | undefined) => {
    if (!n) return;
    checkTag(file, where, n.original_lang);
    if (n.official && n.original_lang in n.official)
      err(file, `${where}: official에 원어(${n.original_lang}) 키가 있음`);
    for (const k of Object.keys(n.official ?? {})) checkTag(file, `${where}.official`, k);
    for (const k of Object.keys(n.aliases ?? {})) checkTag(file, `${where}.aliases`, k);
  };
  const checkText = (file: string, where: string, t: Text | undefined) => {
    if (!t) return;
    checkTag(file, where, t.original_lang);
    for (const k of Object.keys(t.translations ?? {})) checkTag(file, `${where}.translations`, k);
    for (const l of t.translated ?? []) {
      if (!t.translations || !(l in t.translations)) err(file, `${where}: translated의 ${l}이 translations에 없음`);
    }
  };

  // ---- Person ----
  const nameIndex = new Map<string, string[]>();
  for (const p of ds.persons.values()) {
    const f = fileOf('persons', p.id);
    const src = checkSources(f, p.sources);
    checkName(f, 'name', p.name);
    p.agencies?.forEach((a, i) => checkName(f, `agencies[${i}].name`, a.name));
    checkImage(f, 'person', p.image, src);
    checkWiki(f, 'person', p.wikipedia);
    if (p.birth && p.death && partialDateStart(p.birth) > partialDateEnd(p.death)) err(f, 'birth가 death보다 늦음');
    for (const key of new Set([p.name.original, p.name.latin].map(normalize))) {
      nameIndex.set(key, [...(nameIndex.get(key) ?? []), p.id]);
    }
  }
  for (const [key, ids] of nameIndex) {
    if (ids.length > 1)
      warn(
        fileOf('persons', ids[0]),
        `정규화 이름이 같은 성우: ${ids.join(', ')} (${key}) — 중복 생성인지 동명이인인지 확인`,
      );
  }

  // ---- Franchise ----
  const worksByFranchise = new Map<string, Work[]>();
  for (const w of ds.works.values())
    worksByFranchise.set(w.franchise_id, [...(worksByFranchise.get(w.franchise_id) ?? []), w]);

  const usedChars = new Set<string>();
  const usedPersons = new Set<string>();

  for (const fr of ds.franchises.values()) {
    const f = fileOf('franchises', fr.id);
    const src = checkSources(f, fr.sources);
    checkName(f, 'title', fr.title);
    checkWiki(f, 'franchise', fr.wikipedia);
    const ids = new Set<string>();
    for (const c of fr.characters) {
      const where = `characters[${c.id}]`;
      if (ids.has(c.id)) err(f, `캐릭터 id 중복: ${c.id}`);
      ids.add(c.id);
      checkName(f, `${where}.name`, c.name);
      checkText(f, `${where}.description`, c.description);
      checkImage(f, where, c.image, src);
      checkWiki(f, where, c.wikipedia);
      if (c.first_appearance) {
        const w = ds.works.get(c.first_appearance.work);
        if (!w) err(f, `${where}.first_appearance: 존재하지 않는 작품 ${c.first_appearance.work}`);
        else if (w.franchise_id !== fr.id) err(f, `${where}.first_appearance: 다른 프랜차이즈 작품 ${w.id}`);
        else if (c.first_appearance.episode && w.episodes && c.first_appearance.episode > w.episodes)
          err(f, `${where}.first_appearance.episode ${c.first_appearance.episode} > 작품 화수 ${w.episodes}`);
      }
    }
  }

  // ---- Work ----
  const roleRank = { main: 0, supporting: 1, minor: 2 } as const;
  const bestRole = new Map<string, number>(); // franchise/char → 가장 높은 role
  const creditedWorks = new Map<string, Work[]>(); // franchise/char → works with credits
  for (const w of ds.works.values()) {
    const f = fileOf('works', w.id);
    const src = checkSources(f, w.sources);
    checkName(f, 'title', w.title);
    [...(w.studios ?? []), ...(w.developers ?? []), ...(w.publishers ?? [])].forEach((n, i) =>
      checkName(f, `company[${i}]`, n),
    );
    checkWiki(f, 'work', w.wikipedia);
    const fr = ds.franchises.get(w.franchise_id);
    if (!fr) err(f, `존재하지 않는 프랜차이즈 ${w.franchise_id}`);
    if (w.start_date && w.end_date && partialDateStart(w.start_date) > partialDateEnd(w.end_date))
      err(f, 'start_date가 end_date보다 늦음');
    const charIds = new Set(fr?.characters.map((c) => c.id) ?? []);
    const versionIds = new Set<string>();
    for (const v of w.versions) {
      const vw = `versions[${v.id}]`;
      if (versionIds.has(v.id)) err(f, `버전 id 중복: ${v.id}`);
      versionIds.add(v.id);
      checkTag(f, `${vw}.language`, v.language);
      checkText(f, `${vw}.label`, v.label);
      checkName(f, `${vw}.distributor`, v.distributor);
      checkRefs(f, vw, v.source_refs, src);
      if (
        v.release_date &&
        v.last_release_date &&
        partialDateStart(v.release_date) > partialDateEnd(v.last_release_date)
      )
        err(f, `${vw}: release_date가 last_release_date보다 늦음`);
      const combos = new Set<string>();
      v.credits.forEach((c, i) => {
        const cw = `${vw}.credits[${i}]`;
        if (fr && !charIds.has(c.character)) err(f, `${cw}: 프랜차이즈에 없는 캐릭터 ${c.character}`);
        if (!ds.persons.has(c.person)) err(f, `${cw}: 존재하지 않는 성우 ${c.person}`);
        checkRefs(f, cw, c.source_refs, src);
        checkText(f, `${cw}.note`, c.note);
        const combo = JSON.stringify([c.character, c.person, c.part ?? 'regular', c.episodes ?? null]);
        if (combos.has(combo)) err(f, `${cw}: 같은 (캐릭터, 성우, part, episodes) 배역 중복`);
        combos.add(combo);
        if (typeof c.episodes === 'object' && c.episodes.from && c.episodes.to && c.episodes.from > c.episodes.to)
          err(f, `${cw}: episodes.from > to`);
        const key = `${w.franchise_id}/${c.character}`;
        usedChars.add(key);
        usedPersons.add(c.person);
        bestRole.set(key, Math.min(bestRole.get(key) ?? 9, roleRank[c.role]));
        const list = creditedWorks.get(key) ?? [];
        if (!list.includes(w)) creditedWorks.set(key, [...list, w]);
      });
    }
  }

  // ---- 사용되지 않음 / 이미지 누락 / 첫 등장 이상 (경고) ----
  for (const p of ds.persons.values()) {
    if (!usedPersons.has(p.id)) warn(fileOf('persons', p.id), `어떤 배역에서도 참조하지 않는 성우 ${p.id}`);
  }
  for (const fr of ds.franchises.values()) {
    const f = fileOf('franchises', fr.id);
    for (const c of fr.characters) {
      const key = `${fr.id}/${c.id}`;
      if (!usedChars.has(key)) warn(f, `어떤 배역에서도 쓰이지 않는 캐릭터 ${c.id}`);
      if (!c.nameless && (bestRole.get(key) ?? 9) <= 1 && !c.image) warn(f, `주연·조연 캐릭터 ${c.id}에 이미지 없음`);
      const fa = c.first_appearance && ds.works.get(c.first_appearance.work);
      if (fa?.start_date) {
        const faStart = partialDateStart(fa.start_date);
        for (const w of creditedWorks.get(key) ?? []) {
          if (w.start_date && partialDateStart(w.start_date) < faStart)
            warn(f, `캐릭터 ${c.id}: 첫 등장(${fa.id})보다 이른 작품 ${w.id}에 배역이 있음`);
        }
      }
    }
  }

  // ---- redirects ----
  for (const [kind, map] of Object.entries(ds.redirects) as [keyof Dataset['redirects'], Record<string, string>][]) {
    for (const [from, to] of Object.entries(map)) {
      if ((ds[kind] as Map<string, unknown>).has(from))
        err('data/redirects.json', `${kind}.${from}: 이전 id가 아직 존재함`);
      if (!(ds[kind] as Map<string, unknown>).has(to))
        err('data/redirects.json', `${kind}.${from} → ${to}: 대상이 없음`);
    }
  }
}
