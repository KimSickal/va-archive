import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAjv, REPO } from '../scripts/lib/load.ts';

/** 스킬 frontmatter의 schema_version이 data/schema/VERSION과 같아야 한다 (docs/06 3절) */
describe('skills', () => {
  const version = readFileSync(join(REPO, 'data', 'schema', 'VERSION'), 'utf8').trim();
  const dir = join(REPO, '.claude', 'skills');
  for (const s of readdirSync(dir)) {
    it(`${s} schema_version matches`, () => {
      const md = readFileSync(join(dir, s, 'SKILL.md'), 'utf8');
      expect(md.match(/^schema_version:\s*(\S+)/m)?.[1]).toBe(version);
    });
  }
});

describe('schema rejects', () => {
  const ajv = createAjv();
  const base = JSON.parse(readFileSync(join(REPO, 'tests/fixtures/data/works/star-knights-s1.json'), 'utf8'));
  it('accepts fixture', () => expect(ajv.validate('work.schema.json', base)).toBe(true));
  it('rejects unknown field', () => expect(ajv.validate('work.schema.json', { ...base, foo: 1 })).toBe(false));
  it('rejects guest role', () => {
    const w = structuredClone(base);
    w.versions[0].credits[0].role = 'guest';
    expect(ajv.validate('work.schema.json', w)).toBe(false);
  });
});
