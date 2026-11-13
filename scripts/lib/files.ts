import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Redirects } from '../../src/types/data.ts';

export const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
export const writeJson = (p: string, o: unknown) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

export function readRedirects(root: string): Redirects & { $schema: string } {
  const p = join(root, 'redirects.json');
  return existsSync(p)
    ? readJson(p)
    : { $schema: 'schema/redirects.schema.json', persons: {}, franchises: {}, works: {} };
}
export const writeRedirects = (root: string, r: Redirects) => writeJson(join(root, 'redirects.json'), r);
