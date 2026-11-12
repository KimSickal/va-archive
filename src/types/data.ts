/**
 * 원본 데이터 타입. 정본은 data/schema/*.schema.json.
 * 스키마를 바꾸면 이 파일도 함께 고친다 (tests/schema.test.ts가 fixture로 정합성을 확인).
 */

export type Id = string;
/** BCP 47 부분집합 언어 태그 (ja, ko, en, zh-Hans, yue …) */
export type LangTag = string;
/** YYYY | YYYY-MM | YYYY-MM-DD */
export type PartialDate = string;
/** YYYY-MM-DD */
export type FullDate = string;

export interface Name {
  original_lang: LangTag;
  original: string;
  latin: string;
  official?: Record<LangTag, string>;
  aliases?: Record<LangTag, string[]>;
}

export interface Text {
  original_lang: LangTag;
  original: string;
  translations?: Record<LangTag, string>;
  translated?: LangTag[];
}

export type Wikipedia = Record<string, string>;

export interface Image {
  url: string;
  page_url: string;
  source_ref: string;
  license: 'cc0' | 'public_domain' | 'cc_by' | 'cc_by_sa' | 'official_promotional' | 'other';
  credit: string;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher:
    | 'official'
    | 'broadcaster'
    | 'agency'
    | 'personal_sns'
    | 'wikipedia'
    | 'wikimedia_commons'
    | 'ann'
    | 'news'
    | 'namuwiki'
    | 'mal'
    | 'anidb'
    | 'fandom'
    | 'other';
  tier: 1 | 2 | 3;
  accessed_at: FullDate;
}

export type VerificationStatus = 'unverified' | 'verified' | 'disputed' | 'user_confirmed';

export interface RecordMeta {
  researched_at: FullDate;
  verification: { status: VerificationStatus; verified_at?: FullDate; notes?: string };
  skill_version: string;
}

export interface Person {
  $schema?: string;
  id: Id;
  name: Name;
  gender?: 'female' | 'male' | 'other';
  nationality?: string[];
  birth?: PartialDate;
  death?: PartialDate;
  agencies?: { name: Name; from?: PartialDate; to?: PartialDate }[];
  debut_year?: number;
  image?: Image;
  wikipedia?: Wikipedia;
  links?: { kind: 'official' | 'agency' | 'x' | 'instagram' | 'youtube' | 'other'; url: string }[];
  sources: Source[];
  meta: RecordMeta;
}

export interface Character {
  id: Id;
  name: Name;
  description?: Text;
  first_appearance?: { work: Id; episode?: number };
  nameless?: boolean;
  spoiler?: boolean;
  image?: Image;
  wikipedia?: Wikipedia;
}

export interface Franchise {
  $schema?: string;
  id: Id;
  title: Name;
  original_media?: 'manga' | 'light_novel' | 'novel' | 'web_novel' | 'game' | 'anime_original' | 'other';
  wikipedia?: Wikipedia;
  characters: Character[];
  sources: Source[];
  meta: RecordMeta;
}

export type Role = 'main' | 'supporting' | 'minor';
export type Part = 'regular' | 'replaced' | 'replacement' | 'young' | 'substitute' | 'other';
export type Episodes = { from?: number; to?: number } | string;

export interface Credit {
  character: Id;
  person: Id;
  role: Role;
  part?: Part;
  episodes?: Episodes;
  note?: Text;
  credited_as?: string;
  spoiler?: boolean;
  source_refs: string[];
  verification?: VerificationStatus;
}

export interface Version {
  id: Id;
  language: LangTag;
  kind: 'original' | 'dub';
  label: Text;
  distributor?: Name;
  release_date?: PartialDate;
  last_release_date?: PartialDate;
  credits: Credit[];
  source_refs?: string[];
}

export type WorkType = 'anime_tv' | 'anime_movie' | 'anime_ova' | 'anime_ona' | 'anime_special' | 'game';
export type WorkStatus = 'announced' | 'airing' | 'finished' | 'released' | 'live_service' | 'ended_service';

export interface Work {
  $schema?: string;
  id: Id;
  franchise_id: Id;
  type: WorkType;
  title: Name;
  order?: number;
  status: WorkStatus;
  start_date?: PartialDate;
  end_date?: PartialDate;
  episodes?: number;
  runtime_min?: number;
  studios?: Name[];
  developers?: Name[];
  publishers?: Name[];
  wikipedia?: Wikipedia;
  platforms?: string[];
  versions: Version[];
  sources: Source[];
  meta: RecordMeta;
}

export interface Redirects {
  persons: Record<Id, Id>;
  franchises: Record<Id, Id>;
  works: Record<Id, Id>;
}
