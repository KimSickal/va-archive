/**
 * 예의 바른 HTTP: 사이트별 공용 속도 제한 + 로컬 캐시 + Retry-After 준수 (docs/06-data-collection.md 12절)
 *
 * - 속도 제한은 .work/ratelimit/<host> 파일로 여러 프로세스(병렬 에이전트)가 공유한다.
 *   에이전트가 늘어도 사이트별 총 요청 속도는 MIN_INTERVAL 이하로 유지된다.
 * - 캐시는 .work/cache/ 에 URL별로 저장한다 (기본 7일). 조사·검증·재조사가 같은 페이지를 다시 받지 않는다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load.ts';

const WORK = join(REPO, '.work');
const MIN_INTERVAL_MS: Record<string, number> = {
  'wikipedia.org': 1000,
  'wikimedia.org': 1000,
  'unicode.org': 1000,
  default: 2000,
};
const USER_AGENT = 'va-archive-data-tool/0.1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function intervalFor(host: string): number {
  const k = Object.keys(MIN_INTERVAL_MS).find((d) => host === d || host.endsWith(`.${d}`));
  return MIN_INTERVAL_MS[k ?? 'default'];
}

/** mkdir 기반 프로세스 간 잠금 */
async function withLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const dir = join(WORK, 'ratelimit', `${name}.lock`);
  mkdirSync(join(WORK, 'ratelimit'), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      mkdirSync(dir);
      break;
    } catch {
      // 오래된 잠금(프로세스 비정상 종료)은 30초 후 해제
      try {
        if (Date.now() - statSync(dir).mtimeMs > 30_000) rmdirSync(dir);
      } catch {
        /* ignore */
      }
      await sleep(50 + Math.random() * 100);
    }
  }
  try {
    return await fn();
  } finally {
    rmdirSync(dir);
  }
}

/** 사이트별 슬롯을 하나 예약하고, 차례가 올 때까지 기다린다 */
async function takeSlot(host: string): Promise<void> {
  const key = host.split('.').slice(-2).join('.');
  const file = join(WORK, 'ratelimit', key);
  const wait = await withLock(key, () => {
    const last = existsSync(file) ? Number(readFileSync(file, 'utf8')) || 0 : 0;
    const at = Math.max(Date.now(), last + intervalFor(host));
    writeFileSync(file, String(at));
    return at - Date.now();
  });
  if (wait > 0) await sleep(wait);
}

export interface PoliteResponse {
  url: string;
  status: number;
  body: string;
  fromCache: boolean;
}

export async function politeFetch(
  url: string,
  opts: { cacheHours?: number; headers?: Record<string, string> } = {},
): Promise<PoliteResponse> {
  const cacheHours = opts.cacheHours ?? 24 * 7;
  const cdir = join(WORK, 'cache');
  const cfile = join(cdir, createHash('sha256').update(url).digest('hex') + '.json');
  if (cacheHours > 0 && existsSync(cfile) && Date.now() - statSync(cfile).mtimeMs < cacheHours * 3600_000) {
    const c = JSON.parse(readFileSync(cfile, 'utf8'));
    return { url, status: c.status, body: c.body, fromCache: true };
  }
  const host = new URL(url).hostname;
  let res: Response | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    await takeSlot(host);
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...opts.headers } });
    if (res.status !== 429 && res.status < 500) break;
    const retry = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    console.error(`${host} ${res.status}, retry in ${Math.round(retry / 1000)}s`);
    await sleep(retry);
  }
  const body = await res!.text();
  if (res!.ok && cacheHours > 0) {
    mkdirSync(cdir, { recursive: true });
    writeFileSync(cfile, JSON.stringify({ url, status: res!.status, fetched_at: new Date().toISOString(), body }));
  }
  return { url, status: res!.status, body, fromCache: false };
}
