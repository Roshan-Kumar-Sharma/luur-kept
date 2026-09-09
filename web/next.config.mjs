/** @type {import('next').NextConfig} */
export default {
  // The engine ships as TypeScript source, so Next compiles it with the app.
  transpilePackages: ['kept'],

  // The engine uses explicit .js specifiers, which is what Node's ESM resolver
  // requires. Webpack needs telling that those resolve to the .ts sources.
  webpack: (config) => {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },

  outputFileTracingIncludes: {
    // The knowledge base is read from disk at runtime rather than imported, so
    // it has to be traced in explicitly or the deployed build cannot find it.
    '/**': ['../knowledge/**/*'],
  },
};
