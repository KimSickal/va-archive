/**
 * 작업 잠금 (병렬 에이전트가 같은 시리즈를 동시에 수정하지 않게). 오케스트레이터가 작업 배정 시 사용.
 *
 *   npx tsx scripts/cli/lock.ts acquire <key> <owner>   # 예: franchise:gundam-00 research-gundam-00
 *   npx tsx scripts/cli/lock.ts release <key> <owner>
 *   npx tsx scripts/cli/lock.ts list
 * acquire 실패 시 exit 1 과 현재 소유자를 출력한다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../lib/load.ts';

const DIR = join(REPO, '.work', 'locks');
const [cmd, key, owner] = process.argv.slice(2);
const path = (k: string) => join(DIR, encodeURIComponent(k));
mkdirSync(DIR, { recursive: true });

if (cmd === 'acquire' && key && owner) {
  try {
    mkdirSync(path(key)); // 원자적
    writeFileSync(join(path(key), 'owner.json'), JSON.stringify({ owner, at: new Date().toISOString() }));
    console.log(`acquired ${key} by ${owner}`);
  } catch {
    const o = existsSync(join(path(key), 'owner.json')) ? readFileSync(join(path(key), 'owner.json'), 'utf8') : '?';
    console.log(`locked ${key}: ${o}`);
    process.exit(1);
  }
} else if (cmd === 'release' && key && owner) {
  const f = join(path(key), 'owner.json');
  const o = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).owner : undefined;
  if (o && o !== owner) {
    console.log(`not owner of ${key} (owner: ${o})`);
    process.exit(1);
  }
  rmSync(path(key), { recursive: true, force: true });
  console.log(`released ${key}`);
} else if (cmd === 'list') {
  for (const d of readdirSync(DIR)) {
    const f = join(DIR, d, 'owner.json');
    console.log(decodeURIComponent(d), existsSync(f) ? readFileSync(f, 'utf8') : '');
  }
} else {
  console.error('usage: lock.ts acquire|release <key> <owner> | list');
  process.exit(2);
}
