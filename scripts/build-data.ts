/**
 * data/ → public/data/db.<hash>.json + manifest.json (docs/04-data-build.md)
 *
 *   npm run build:data                                  # data/
 *   npm run build:data -- --root tests/fixtures/data    # 다른 루트 (개발용)
 *   DATA_ROOTS=a,b npm run build:data                   # 환경변수로도 지정 가능
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDb } from '../src/data/buildDb.ts';
import type { Manifest } from '../src/data/db.ts';
import { checkIntegrity } from './lib/integrity.ts';
import { type Issue, loadDataset, REPO, SCHEMA_DIR } from './lib/load.ts';

const args = process.argv.slice(2);
const roots: string[] = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--root') roots.push(args[++i]);
if (!roots.length && process.env.DATA_ROOTS) roots.push(...process.env.DATA_ROOTS.split(','));
if (!roots.length) roots.push(join(REPO, 'data'));

const issues: Issue[] = [];
const ds = loadDataset(roots, issues);
checkIntegrity(ds, issues);
const errors = issues.filter((i) => i.level === 'error');
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e.file}: ${e.message}`);
  console.error(`${errors.length} errors — run \`npm run validate\``);
  process.exit(1);
}

const db = buildDb({
  schemaVersion: readFileSync(join(SCHEMA_DIR, 'VERSION'), 'utf8').trim(),
  persons: [...ds.persons.values()],
  franchises: [...ds.franchises.values()],
  works: [...ds.works.values()],
  redirects: ds.redirects,
});

const json = JSON.stringify(db);
const hash = createHash('sha256').update(json).digest('hex').slice(0, 8);
const outDir = join(REPO, 'public', 'data');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^db\..*\.json$/.test(f)) rmSync(join(outDir, f));
const dbFile = `db.${hash}.json`;
writeFileSync(join(outDir, dbFile), json);
const manifest: Manifest = {
  db: dbFile,
  built_at: db.builtAt,
  schema_version: db.schemaVersion,
  counts: {
    persons: ds.persons.size,
    franchises: ds.franchises.size,
    works: ds.works.size,
    credits: Object.values(db.idx.creditsByPerson).reduce((n, l) => n + l.length, 0),
  },
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`wrote public/data/${dbFile} (${(json.length / 1024).toFixed(1)} KiB)`, manifest.counts);
