# @allex/rollup-plugin-node-resolve

*This plugin used to be called rollup-plugin-npm*

Locate modules using the [Node resolution algorithm](https://nodejs.org/api/modules.html#modules_all_together), for using third party modules in `node_modules`

> Based on forked from [rollup-plugin-node-resolve](https://github.com/rollup/rollup-plugin-node-resolve), with some improvements and PR merges:
>
> * New mainfields option [#182](https://github.com/rollup/rollup-plugin-node-resolve/pull/182)
> * Add supports alias options
> * Fix pkg.browser mappings issue by specifying a value of `false` [#183](https://github.com/rollup/rollup-plugin-node-resolve/pull/183)

## Installation

```bash
npm install --save-dev @allex/rollup-plugin-node-resolve@next
```

## Usage

```js
// rollup.config.js
import resolve from '@allex/rollup-plugin-node-resolve';

export default {
  input: 'main.js',
  output: {
    file: 'bundle.js',
    format: 'iife'
  },
  name: 'MyModule',
  plugins: [
    resolve({

      // the fields to scan in a package.json to determine the entry point..
      mainFields: ['module', 'main'], // Default: ['module', 'main']

      // DEPRECATED: use `mainFields` instead
      // use "module" field for ES6 module if possible
      module: true, // Default: true

      // DEPRECATED: use `mainFields` instead
      // use "jsnext:main" if possible
      // legacy field pointing to ES6 module in third-party libraries,
      // deprecated in favor of "pkg.module":
      // - see: https://github.com/rollup/rollup/wiki/pkg.module
      jsnext: true,  // Default: false

      // DEPRECATED: use `mainFields` instead
      // use "main" field or index.js, even if it's not an ES6 module
      // (needs to be converted from CommonJS to ES6
      // – see https://github.com/rollup/rollup-plugin-commonjs
      main: true,  // Default: true

      // DEPRECATED: use `mainFields` instead
      // some package.json files have a `browser` field which
      // specifies alternative files to load for people bundling
      // for the browser. If that's you, use this option, otherwise
      // pkg.browser will be ignored
      browser: true,  // Default: false

      // not all files you want to resolve are .js files
      extensions: [ '.mjs', '.js', '.jsx', '.json' ],  // Default: [ '.mjs', '.js', '.json', '.node' ]

      // whether to prefer built-in modules (e.g. `fs`, `path`) or
      // local ones with the same names
      preferBuiltins: false,  // Default: true

      // Lock the module search in this path (like a chroot). Module defined
      // outside this path will be marked as external
      jail: '/my/jail/path', // Default: '/'

      // Set to an array of strings and/or regexps to lock the module search
      // to modules that match at least one entry. Modules not matching any
      // entry will be marked as external
      only: [ 'some_module', /^@some_scope\/.*$/ ], // Default: null

      // If true, inspect resolved files to check that they are
      // ES2015 modules
      modulesOnly: true, // Default: false

      // Any additional options that should be passed through
      // to node-resolve
      customResolveOptions: {
        moduleDirectory: 'js_modules'
      },

      // Provide alias to overrides specifing modules.
      alias: {
        'readable-stream': require.resolve('rollup-plugin-node-builtins/src/es6/stream.js')
      }
    })
  ]
};
```

## Using with @allex/rollup-plugin-commonjs

Since most packages in your node_modules folder are probably legacy CommonJS rather than JavaScript modules, you may need to use [rollup-plugin-commonjs](https://github.com/rollup/rollup-plugin-commonjs):

```js
// rollup.config.js
import resolve from '@allex/rollup-plugin-node-resolve';
import commonjs from '@allex/rollup-plugin-commonjs';

export default {
  input: 'main.js',
  output: {
    file: 'bundle.js',
    format: 'iife'
  },
  name: 'MyModule',
  plugins: [
    resolve(),
    commonjs()
  ]
};
```


## License

MIT
