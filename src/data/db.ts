import type { Franchise, Person, Redirects, Work } from '../types/data';

/** 빌드 산출물 db.<hash>.json 의 구조 (docs/04-data-build.md 3절) */

/** 배역 참조: works[work].versions[vi].credits[ci] */
export interface CreditRef {
  work: string;
  vi: number;
  ci: number;
  lang: string;
  /** 작품이 속한 프랜차이즈 */
  franchise: string;
  /** 캐릭터가 정의된(원작) 프랜차이즈. 크로스오버·스핀오프면 franchise 와 다르다 */
  charFranchise: string;
  /** charFranchise 안의 캐릭터 id */
  character: string;
  person: string;
}

export interface FirstVoiced {
  work: string;
  vi: number;
  episode?: number;
}

export interface SearchEntry {
  kind: 'person' | 'work' | 'franchise' | 'character';
  /** character는 "franchiseId/characterId" */
  id: string;
  keys: string[];
  spoiler?: boolean;
}

export interface Db {
  schemaVersion: string;
  builtAt: string;
  persons: Record<string, Person>;
  franchises: Record<string, Franchise>;
  works: Record<string, Work>;
  redirects: Redirects;
  idx: {
    creditsByPerson: Record<string, CreditRef[]>;
    /** "franchise/character" → 배역 */
    creditsByCharacter: Record<string, CreditRef[]>;
    personsByWorkLang: Record<string, Record<string, string[]>>;
    personsByFranchiseLang: Record<string, Record<string, string[]>>;
    worksByPerson: Record<string, string[]>;
    worksByFranchise: Record<string, string[]>;
    /** "원작프랜차이즈/캐릭터" → 등장하는 프랜차이즈 목록 (원작 프랜차이즈가 첫 번째) */
    franchisesByCharacter: Record<string, string[]>;
    /** 프랜차이즈 → 그 프랜차이즈 작품에 등장하는 다른 프랜차이즈 캐릭터 ("원작/캐릭터") */
    guestCharactersByFranchise: Record<string, string[]>;
    /** 표시 ID(slug) → 내부 ID */
    personIdBySlug: Record<string, string>;
    lastReleaseByWork: Record<string, string | null>;
    firstVoicedByCharacter: Record<string, Record<string, FirstVoiced>>;
  };
  search: SearchEntry[];
}

export interface Manifest {
  db: string;
  built_at: string;
  schema_version: string;
  counts: { persons: number; franchises: number; works: number; credits: number };
}
