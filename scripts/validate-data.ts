/**
 * 데이터 검증: 스키마 + 참조 무결성 (docs/03-data-model.md 7절)
 *
 *   npm run validate                         # data/ 검증
 *   npm run validate -- --root data --root .work/x/data   # 여러 루트를 합쳐서 검증 (스테이징 확인용)
 *   npm run validate -- --quiet-warnings     # 경고는 개수만 출력
 */
import { join } from 'node:path';
import { checkIntegrity } from './lib/integrity.ts';
import { type Issue, loadDataset, REPO } from './lib/load.ts';

const args = process.argv.slice(2);
const roots: string[] = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--root') roots.push(args[++i]);
if (roots.length === 0) roots.push(join(REPO, 'data'));
const quietWarnings = args.includes('--quiet-warnings');

const issues: Issue[] = [];
const ds = loadDataset(roots, issues);
checkIntegrity(ds, issues);

const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');
for (const i of errors) console.log(`ERROR   ${i.file}: ${i.message}`);
if (!quietWarnings) for (const i of warnings) console.log(`WARNING ${i.file}: ${i.message}`);
console.log(
  `\n${ds.persons.size} persons, ${ds.franchises.size} franchises, ${ds.works.size} works — ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
