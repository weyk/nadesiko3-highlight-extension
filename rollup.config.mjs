export default {
  input: './.build/extension.mjs',
  output: {
    file: './lib/extension.js',
    format: "cjs",
    exports: "named",
    sourcemap: true,
  },
  external: [
    'node:events',
    'node:fs/promises',
    'node:path',
    'vscode',
    './nako3/command.json'
  ]
}
