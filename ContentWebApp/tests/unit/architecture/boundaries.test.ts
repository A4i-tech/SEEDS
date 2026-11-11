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
  const found: string[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /(?:import|export)[^'"]*['"](@[^'"]+)['"]/.exec(line);
    if (match) found.push(match[1]);
  }
  return found;
}

function under(root: string) {
  return walk(join(SRC, root));
}

describe('architecture boundaries', () => {
  it('shared never imports from features', () => {
    const bad = under('shared').flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith('@features/'))
        .map((spec) => `${relative(SRC, file)} -> ${spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('features never import from app', () => {
    const bad = under('features').flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith('@app/'))
        .map((spec) => `${relative(SRC, file)} -> ${spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('jobs never import from make-accessible', () => {
    const bad = under('features/jobs').flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith('@features/make-accessible'))
        .map((spec) => `${relative(SRC, file)} -> ${spec}`),
    );
    expect(bad).toEqual([]);
  });
});
