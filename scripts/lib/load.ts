import Ajv2020 from 'ajv/dist/2020.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { Franchise, Person, Redirects, Work } from '../../src/types/data.ts';

export const REPO = join(import.meta.dirname, '..', '..');
export const SCHEMA_DIR = join(REPO, 'data', 'schema');

export interface Dataset {
  persons: Map<string, Person>;
  franchises: Map<string, Franchise>;
  works: Map<string, Work>;
  redirects: Redirects;
  /** id → 파일 경로 (메시지 표시용), key: "<kind>:<id>" */
  files: Map<string, string>;
}

export interface Issue {
  level: 'error' | 'warning';
  file: string;
  message: string;
}

export function createAjv() {
  const Ajv = (Ajv2020 as unknown as { default: typeof Ajv2020 }).default ?? Ajv2020;
  const ajv = new Ajv({ strict: true, allErrors: true, strictRequired: false });
  for (const f of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8')));
  }
  return ajv;
}

const KINDS = [
  ['persons', 'person.schema.json'],
  ['franchises', 'franchise.schema.json'],
  ['works', 'work.schema.json'],
] as const;

/**
 * 하나 이상의 데이터 루트(각각 persons/ franchises/ works/ 하위 디렉토리를 가짐)를 읽어 합친다.
 * 스키마 검증 실패 파일은 issues에 기록하고 데이터셋에서 제외한다.
 */
export function loadDataset(roots: string[], issues: Issue[]): Dataset {
  const ajv = createAjv();
  const ds: Dataset = {
    persons: new Map(),
    franchises: new Map(),
    works: new Map(),
    redirects: { persons: {}, franchises: {}, works: {} },
    files: new Map(),
  };
  for (const root of roots) {
    for (const [kind, schema] of KINDS) {
      const dir = join(root, kind);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()) {
        const path = join(dir, f);
        const rel = relative(REPO, path);
        let json: unknown;
        try {
          json = JSON.parse(readFileSync(path, 'utf8'));
        } catch (e) {
          issues.push({ level: 'error', file: rel, message: `JSON 파싱 실패: ${(e as Error).message}` });
          continue;
        }
        if (!ajv.validate(schema, json)) {
          for (const err of ajv.errors ?? []) {
            issues.push({
              level: 'error',
              file: rel,
              message: `스키마: ${err.instancePath || '/'} ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`,
            });
          }
          continue;
        }
        const obj = json as { id: string };
        if (basename(f, '.json') !== obj.id) {
          issues.push({ level: 'error', file: rel, message: `파일명과 id가 다름 (id=${obj.id})` });
        }
        const map = ds[kind] as Map<string, unknown>;
        const key = `${kind}:${obj.id}`;
        if (map.has(obj.id)) {
          issues.push({ level: 'error', file: rel, message: `id 중복: ${obj.id} (이미 ${ds.files.get(key)})` });
          continue;
        }
        map.set(obj.id, obj);
        ds.files.set(key, rel);
      }
    }
    const redirectsPath = join(root, 'redirects.json');
    if (existsSync(redirectsPath)) {
      const json = JSON.parse(readFileSync(redirectsPath, 'utf8'));
      if (!ajv.validate('redirects.schema.json', json)) {
        issues.push({ level: 'error', file: relative(REPO, redirectsPath), message: ajv.errorsText(ajv.errors) });
      } else {
        for (const k of ['persons', 'franchises', 'works'] as const) Object.assign(ds.redirects[k], json[k]);
      }
    }
  }
  return ds;
}
