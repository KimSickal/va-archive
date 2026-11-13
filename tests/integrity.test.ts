import { describe, expect, it } from 'vitest';
import { checkIntegrity } from '../scripts/lib/integrity.ts';
import type { Dataset, Issue } from '../scripts/lib/load.ts';
import type { Decision, Person } from '../src/types/data.ts';

const meta = { researched_at: '2026-11-13', verification: { status: 'unverified' as const }, skill_version: '0' };
const src = [
  { id: 's1', url: 'https://x', title: 't', publisher: 'other' as const, tier: 2 as const, accessed_at: '2026-11-13' },
];
const person = (id: string, slug: string, original: string, birth?: string, aliases?: string[]): Person => ({
  id,
  slug,
  name: {
    original_lang: 'ja',
    original,
    latin: slug.replace(/-/g, ' '),
    ...(aliases ? { aliases: { ja: aliases } } : {}),
  },
  ...(birth ? { birth } : {}),
  sources: src,
  meta,
});
const ds = (persons: Person[], decisions: Decision[] = []): Dataset => ({
  persons: new Map(persons.map((p) => [p.id, p])),
  franchises: new Map(),
  works: new Map(),
  redirects: { persons: {}, franchises: {}, works: {} },
  decisions: new Map(decisions.map((d) => [d.id, d])),
  files: new Map(),
});
const dupErrors = (d: Dataset) => {
  const issues: Issue[] = [];
  checkIntegrity(d, issues);
  return issues.filter((i) => i.level === 'error' && i.message.includes('중복 의심'));
};

describe('duplicate person check', () => {
  it('flags same original name with compatible birth years', () => {
    expect(dupErrors(ds([person('a', 'ren-a', '黒沢蓮', '1985'), person('b', 'ren-b', '黒沢蓮')]))).toHaveLength(1);
  });
  it('flags when one original equals the other alias (former stage name)', () => {
    expect(
      dupErrors(ds([person('a', 'x-a', '古谷徹', undefined, ['蒼月昇']), person('b', 'x-b', '蒼月昇')])),
    ).toHaveLength(1);
  });
  it('does not flag different birth years', () => {
    expect(dupErrors(ds([person('a', 'y-a', '林勇', '1960'), person('b', 'y-b', '林勇', '1990')]))).toHaveLength(0);
  });
  it('is exempted by a different_person decision', () => {
    const d: Decision = {
      id: 'd1',
      date: '2026-11-13',
      kind: 'different_person',
      subjects: [
        { kind: 'person', id: 'a' },
        { kind: 'person', id: 'b' },
      ],
      decision: 'homonyms',
      rationale: 'different agencies',
      decided_by: 'mediator',
    };
    expect(dupErrors(ds([person('a', 'z-a', '林勇'), person('b', 'z-b', '林勇')], [d]))).toHaveLength(0);
  });
});
