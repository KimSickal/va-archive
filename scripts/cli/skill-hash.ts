/**
 * 스킬 최신 여부 점검 (docs/06-data-collection.md 3절). 실행 중인 스킬 하나만 점검한다.
 *
 *   npx tsx scripts/cli/skill-hash.ts hash <skill-dir>
 *   npx tsx scripts/cli/skill-hash.ts check <skill-name> [<running-skill-dir>]
 *       → git fetch origin main 후, 실행 중인 스킬 디렉토리(기본: .claude/skills/<name>)와
 *         origin/main 의 .claude/skills/<name> 해시를 비교. 다르면 exit 1 ("stale")
 * 해시: 디렉토리 아래 파일을 상대경로 순으로 정렬해 "경로\0내용(LF)\0" 을 이은 SHA-256.
 * origin 이 없으면(로컬 전용 레포) 비교를 건너뛰고 exit 0 ("no-remote").
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../lib/load.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
export function hashDir(dir: string): string {
  const h = createHash('sha256');
  for (const f of walk(dir).sort())
    h.update(`${relative(dir, f)}\0${readFileSync(f, 'utf8').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex');
}
function hashGitTree(ref: string, path: string): string | null {
  const git = (...a: string[]) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' });
  let files: string[];
  try {
    files = git('ls-tree', '-r', '--name-only', ref, path).split('\n').filter(Boolean);
  } catch {
    return null;
  }
  if (!files.length) return null;
  const h = createHash('sha256');
  for (const f of files.sort())
    h.update(`${relative(path, f)}\0${git('show', `${ref}:${f}`).replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex');
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'hash' && a) console.log(hashDir(a));
else if (cmd === 'check' && a) {
  const running = b ?? join(REPO, '.claude', 'skills', a);
  const remotes = execFileSync('git', ['remote'], { cwd: REPO, encoding: 'utf8' }).trim();
  if (!remotes.includes('origin')) {
    console.log('no-remote');
    process.exit(0);
  }
  execFileSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: REPO });
  const latest = hashGitTree('origin/main', `.claude/skills/${a}`);
  const mine = hashDir(running);
  if (latest === null) console.log('not-on-origin');
  else if (latest === mine) console.log('up-to-date');
  else {
    console.log(`stale (running ${mine.slice(0, 12)} ≠ origin/main ${latest.slice(0, 12)})`);
    process.exit(1);
  }
} else {
  console.error('usage: skill-hash.ts hash <dir> | check <skill-name> [<running-dir>]');
  process.exit(2);
}
