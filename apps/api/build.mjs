import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/main.js',
  sourcemap: true,
  plugins: [
    {
      name: 'externalize-deps',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith('.') || args.path.startsWith('@multivus/') || args.path.startsWith('/')) {
            return null
          }
          return { path: args.path, external: true }
        })
      },
    },
  ],
})
