/**
 * 성우 ID 규칙 (docs/03-data-model.md "성우 ID")
 * - 내부 ID: internalIdBase(원어) [+ "-N" 동명이인 번호, N>=2]. 불변.
 * - 표시 ID(slug): slugify(latin), 로마자 표기가 없으면 내부 ID. 같은 slug 후보가 여럿이면 -{출생연도|0000}, 같은 해면 -{번호}.
 *
 * 캐릭터 ID 규칙 (docs/03-data-model.md "캐릭터 ID")
 * - characterIdBase(원어) [+ "-N", 같은 프랜차이즈에 기본형이 겹칠 때 N>=2]. URL에도 그대로 쓴다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Name, Person } from '../../src/types/data.ts';
import { SCHEMA_DIR } from './load.ts';
import { internalIdBase, slugify } from './romanize.ts';

const MAX_ID = 72;

/** 캐릭터 내부 ID 기본형: 원어 표기의 결정적 로마자 변환. 너무 길면 토큰 경계에서 자른다 */
export function characterIdBase(name: Name): string {
  let b = internalIdBase(name.original, name.original_lang) || 'character';
  if (b.length > MAX_ID) b = b.slice(0, MAX_ID).replace(/-[^-]*$/, '');
  return b;
}

/** 성우 slug 기본형: 로마자 표기가 있으면 그 slug, 없으면 내부 ID */
export function personSlugBase(p: Person): string {
  return p.name.latin ? slugify(p.name.latin) : p.id;
}

/** data/schema/PERSON_ID_SCHEME: "legacy"(마이그레이션 전) | "romanized-v1" */
export function personIdScheme(): string {
  const f = join(SCHEMA_DIR, 'PERSON_ID_SCHEME');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : 'legacy';
}

/** 내부 ID의 동명이인 번호 (접미사 없으면 1) */
export function homonymNumber(id: string, base?: string): number {
  if (base && id === base) return 1;
  const m = id.match(/-(\d+)$/);
  return base ? (m && id === `${base}-${m[1]}` ? Number(m[1]) : 1) : m ? Number(m[1]) : 1;
}

/** 전체 성우 목록으로부터 기대 slug를 계산한다 */
export function expectedSlugs(
  persons: Person[],
  internalBase?: (p: Person) => string | undefined,
): Map<string, string> {
  const byBase = new Map<string, Person[]>();
  for (const p of persons) {
    const b = personSlugBase(p);
    byBase.set(b, [...(byBase.get(b) ?? []), p]);
  }
  const out = new Map<string, string>();
  for (const [base, group] of byBase) {
    if (group.length === 1) {
      out.set(group[0].id, base);
      continue;
    }
    const year = (p: Person) => p.birth?.slice(0, 4) ?? '0000';
    const byYear = new Map<string, Person[]>();
    for (const p of group) byYear.set(year(p), [...(byYear.get(year(p)) ?? []), p]);
    for (const [y, same] of byYear) {
      if (same.length === 1) {
        out.set(same[0].id, `${base}-${y}`);
        continue;
      }
      // 같은 해 동명이인: 내부 ID의 동명이인 번호. 번호가 겹치면(원어가 달라 둘 다 1) 내부 ID 순서로 매긴다
      const nums = same.map((p) => homonymNumber(p.id, internalBase?.(p)));
      const unique = new Set(nums).size === nums.length;
      const sorted = [...same].sort((a, b) => a.id.localeCompare(b.id));
      same.forEach((p, i) => out.set(p.id, `${base}-${y}-${unique ? nums[i] : sorted.indexOf(p) + 1}`));
    }
  }
  return out;
}
