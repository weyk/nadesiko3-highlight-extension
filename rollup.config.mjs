export default {
  input: './.build/extension.mjs',
  output: {
    file: './lib/extension.js',
    format: "cjs",
    exports: "named",
    sourcemap: true,
  },
  external: [
    'vscode',
    './nako3/command.json'
  ]
}
