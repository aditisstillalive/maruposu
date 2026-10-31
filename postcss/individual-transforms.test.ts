import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import plugin from './individual-transforms.cjs';

const run = async (css: string) => (await postcss([plugin()]).process(css, { from: undefined })).css.replace(/\s*([{}:;])\s*/g, '$1').replace(/\s+/g, ' ');

describe('individual transform fallback', () => {
  it('adds a transform for browsers without the translate property, guarded by @supports', async () => {
    const out = await run('.a{--tw-translate-x:-50%;translate:var(--tw-translate-x) var(--tw-translate-y)}');
    expect(out).toContain('@supports not (translate:0)');
    expect(out).toContain('--tw-fb-translate:var(--tw-translate-x, 0), var(--tw-translate-y, 0)');
    expect(out).toContain('transform:translate(var(--tw-fb-translate, 0px, 0px)) rotate(var(--tw-fb-rotate, 0deg)) scale(var(--tw-fb-scale, 1, 1))');
  });

  it('handles scale and rotate so utilities compose', async () => {
    const out = await run('.s{scale:var(--tw-scale-x) var(--tw-scale-y)}.r{rotate:45deg}');
    expect(out).toContain('--tw-fb-scale:var(--tw-scale-x, 1), var(--tw-scale-y, 1)');
    expect(out).toContain('--tw-fb-rotate:45deg');
  });

  it('keeps @media context and leaves other rules alone', async () => {
    const out = await run('@media (min-width:640px){.m{translate:0 10px}}.x{color:red}');
    expect(out).toMatch(/@media \(min-width:640px\)\{\.m\{translate:0 10px\}@supports not \(translate:0\)\{\.m\{--tw-fb-translate:0, 10px/);
    expect(out).not.toMatch(/\.x\{[^}]*--tw-fb/);
  });
});
