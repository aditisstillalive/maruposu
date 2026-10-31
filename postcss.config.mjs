export default {
  plugins: {
    '@tailwindcss/postcss': {},
    // Tablets whose system WebView is older than Chrome 111 (e.g. Huawei without
    // Google Play) can't read Tailwind 4's CSS as is: flatten cascade layers and
    // nesting, and write oklch()/color-mix() as sRGB (also inside the theme's
    // custom properties, where side-by-side fallbacks would not apply).
    'postcss-preset-env': {
      browsers: 'chrome >= 80',
      stage: false,
      features: {
        'cascade-layers': true,
        'nesting-rules': true,
        'oklab-function': { preserve: false },
        'color-mix': { preserve: false },
        'is-pseudo-class': true,
        'media-query-ranges': true,
        'logical-properties-and-values': { blockDirection: 'top-to-bottom', inlineDirection: 'left-to-right' },
      },
    },
    // translate/scale/rotate properties (Chrome 104+) as transform for older WebViews
    './postcss/individual-transforms.cjs': {},
  },
};
