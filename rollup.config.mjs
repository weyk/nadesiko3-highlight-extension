import json from '@rollup/plugin-json'

export default {
  input: './.build/extension.mjs',
  output: {
    file: './lib/extension.js',
    format: "cjs",
    exports: "named",
    sourcemap: true,
  },
  plugins: [json({compact: true})],
  external: ['vscode']
}
