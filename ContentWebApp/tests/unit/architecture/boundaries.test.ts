import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*['"](@[^'"]+)['"]/g)].map((match) => match[1]);
}

function violations(root: string, forbidden: string) {
  return walk(join(SRC, root)).flatMap((file) =>
    importsOf(file)
      .filter((spec) => spec.startsWith(forbidden))
      .map((spec) => `${relative(SRC, file)} -> ${spec}`),
  );
}

const SHARED_FEATURE_EXCEPTIONS = new Set([
  'shared/components/DownloadMenu.tsx -> @features/jobs/hooks/useDownloadArtifact',
  'shared/components/DownloadMenu.tsx -> @features/jobs/types/job.types',
  'shared/components/DownloadMenu.tsx -> @features/jobs/utils/artifacts',
]);

describe('architecture boundaries', () => {
  it('shared never imports from features', () => {
    expect(violations('shared', '@features/').filter((v) => !SHARED_FEATURE_EXCEPTIONS.has(v))).toEqual([]);
  });

  it('features never import from app', () => {
    expect(violations('features', '@app/')).toEqual([]);
  });

  it('jobs never import from make-accessible', () => {
    expect(violations('features/jobs', '@features/make-accessible')).toEqual([]);
  });
});
