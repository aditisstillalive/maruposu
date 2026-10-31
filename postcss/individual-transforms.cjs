// Tailwind 4 moves elements with the individual `translate`, `scale` and `rotate`
// properties (Chrome 104+). Older Android WebViews ignore them, so dialogs that
// are centred with translate(-50%, -50%) end up off-screen. For those browsers
// only (@supports not), each such rule also sets a combined `transform`; every
// rule writes its part to its own custom property so utilities still compose.
const PROPS = { translate: '--tw-fb-translate', scale: '--tw-fb-scale', rotate: '--tw-fb-rotate' };
const TRANSFORM = 'translate(var(--tw-fb-translate, 0px, 0px)) rotate(var(--tw-fb-rotate, 0deg)) scale(var(--tw-fb-scale, 1, 1))';

/** "A B" -> "A, B" with defaults for Tailwind's variables (no @property in old browsers). */
function args(prop, value) {
  const fallback = prop === 'scale' ? '1' : '0';
  const withDefaults = value.replace(/var\((--[\w-]+)\)/g, `var($1, ${fallback})`);
  if (prop === 'rotate') return /^(initial|none|0)$/.test(value.trim()) ? '0deg' : withDefaults;
  const parts = withDefaults.match(/var\([^)]*\)|[^\s]+/g) ?? [];
  if (parts.length === 1 && prop === 'scale') parts.push(parts[0]);
  if (parts.length === 1) parts.push('0');
  if (parts[0] === 'none' || parts[0] === 'initial') return prop === 'scale' ? '1, 1' : '0px, 0px';
  return parts.slice(0, 2).join(', ');
}

function individualTransforms() {
  return {
    postcssPlugin: 'individual-transforms-fallback',
    OnceExit(root, { atRule, rule, decl }) {
      root.walkRules(r => {
        if (r.parent?.type === 'atrule' && r.parent.name === 'supports') return;
        if (r.parent?.type === 'atrule' && /keyframes$/.test(r.parent.name)) return;
        const parts = [];
        r.each(d => {
          if (d.type === 'decl' && PROPS[d.prop]) parts.push(decl({ prop: PROPS[d.prop], value: args(d.prop, d.value) }));
        });
        if (!parts.length) return;
        const fallback = atRule({ name: 'supports', params: 'not (translate: 0)' });
        fallback.append(rule({ selector: r.selector, nodes: [...parts, decl({ prop: 'transform', value: TRANSFORM })] }));
        r.after(fallback);
      });
    },
  };
}
individualTransforms.postcss = true;
module.exports = individualTransforms;
