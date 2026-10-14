// Los bundles CLI conservan los paquetes externos. Node ESM necesita la
// extensión real de estos subpaths de Next, a diferencia del bundler web.
export function nodeServerBuildOptions(options) {
  return {
    ...options,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    bundle: true,
    packages: 'external',
    plugins: [{
      name: 'node-server-imports',
      setup(builder) {
        builder.onResolve({ filter: /^next\/(server|headers)$/ }, args => ({ path: `${args.path}.js`, external: true }));
        // El marcador protege la aplicación cliente; estos procesos son sólo Node.
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'cli-marker' }));
        builder.onLoad({ filter: /.*/, namespace: 'cli-marker' }, () => ({ contents: 'export {};', loader: 'js' }));
      },
    }, ...(options.plugins ?? [])],
  };
}
