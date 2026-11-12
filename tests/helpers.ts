import { join } from 'node:path';
import { checkIntegrity } from '../scripts/lib/integrity.ts';
import { type Issue, loadDataset, REPO } from '../scripts/lib/load.ts';
import { buildDb } from '../src/data/buildDb.ts';

export const FIXTURE = join(REPO, 'tests', 'fixtures', 'data');

export function fixtureDb() {
  const issues: Issue[] = [];
  const ds = loadDataset([FIXTURE], issues);
  checkIntegrity(ds, issues);
  return {
    issues,
    db: buildDb({
      schemaVersion: 'test',
      persons: [...ds.persons.values()],
      franchises: [...ds.franchises.values()],
      works: [...ds.works.values()],
      redirects: ds.redirects,
    }),
  };
}
