import {dirname, extname, normalize, resolve, sep, join} from 'path';
import builtins from 'builtin-modules';
import resolveId from 'resolve';
import isModule from 'is-module';
import fs from 'fs';

const ES6_BROWSER_EMPTY = resolve( __dirname, '../src/empty.js' );

// It is important that .mjs occur before .js so that Rollup will interpret npm modules
// which deploy both ESM .mjs and CommonJS .js files as ESM.
const DEFAULT_EXTS = [ '.mjs', '.js', '.json', '.node' ];

let readFileCache = {};
const readFileAsync = file => new Promise((fulfil, reject) => fs.readFile(file, (err, contents) => err ? reject(err) : fulfil(contents)));
const statAsync = file => new Promise((fulfil, reject) => fs.stat(file, (err, contents) => err ? reject(err) : fulfil(contents)));

function cachedReadFile (file, cb) {
	if (file in readFileCache === false) {
		readFileCache[file] = readFileAsync(file).catch(err => {
			delete readFileCache[file];
			throw err;
		});
	}
	readFileCache[file].then(contents => cb(null, contents), cb);
}

let isFileCache = {};
function cachedIsFile (file, cb) {
	if (file in isFileCache === false) {
		isFileCache[file] = statAsync(file)
			.then(
				stat => stat.isFile(),
				err => {
					if (err.code == 'ENOENT') return false;
					delete isFileCache[file];
					throw err;
				});
	}
	isFileCache[file].then(contents => cb(null, contents), cb);
}

function deprecatedMainField (options, option, mainFields, field = option) {
	if (option in options) {
		if (options[option] === false) {
			return mainFields.filter(mainField => mainField !== field);
		} else if (options[option] === true && !mainFields.includes(field)) {
			return mainFields.concat(field);
		}
	}
	return mainFields;
}

const resolveIdAsync = (file, opts) => new Promise((fulfil, reject) => resolveId(file, opts, (err, contents) => err ? reject(err) : fulfil(contents)));

// resolve alias helpers
const isAlias = (file, alias) => {
	if (alias === file) {
		return true;
	}
	if (!file.startsWith(alias)) {
		return false;
	}
	return file[alias.length] === '/';
};
const getAlias = (file, aliases, offset) => {
	for (let i = offset, l = aliases.length, o; i < l; ++i) {
		if ((o = aliases[i]) && isAlias(file, o[0])) return [ i, o ];
	}
	return null;
};
const localImport = /^[.]{1,2}\//;
const resolveAliases = (target, aliases, offset = 0) => {
	if (localImport.test(target)) return null;
	const tuple = getAlias(target, aliases, offset);
	if (tuple === null) return null;
	let [ cursor, [ alias, p ] ] = tuple; // eslint-disable-line prefer-const
	p = join(p, target.substr(alias.length));
	return resolveAliases(p, aliases, ++cursor) || p;
};

export default function nodeResolve ( options = {} ) {
	if ('mainFields' in options && ('module' in options || 'main' in options || 'jsnext' in options)) {
		throw new Error(`node-resolve: do not use deprecated 'module', 'main', 'jsnext' options with 'mainFields'`);
	}

	let mainFields = options.mainFields || [];
	const fields = { 'browser': 0, 'module': 0, 'jsnext': 'jsnext:main', 'main': 0 };
	const keys = Object.keys(options).filter(k => fields.hasOwnProperty(k));

	// build mainFields by plugins options (keep options order)
	mainFields = keys.reduce((list, k) => deprecatedMainField(options, k, list, fields[k] || k), mainFields);

	// set defaults mainFields if none options
	[ 'module', 'main' ].forEach(k => {
		if (!mainFields.includes(k) && options[k] !== false) mainFields.push(k);
	});

	const isPreferBuiltinsSet = options.preferBuiltins === true || options.preferBuiltins === false;
	const preferBuiltins = isPreferBuiltinsSet ? options.preferBuiltins : true;
	const customResolveOptions = options.customResolveOptions || {};
	const jail = options.jail;
	const only = Array.isArray(options.only)
		? options.only.map(o => o instanceof RegExp
			? o
			: new RegExp('^' + String(o).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&') + '$')
		)
		: null;
	const browserMapCache = {};

	if ( options.skip ) {
		throw new Error( 'options.skip is no longer supported — you should use the main Rollup `external` option instead' );
	}

	if ( !mainFields.length ) {
		throw new Error( `Please ensure at least one 'mainFields' value is specified` );
	}

	// { k/v, ... } => [ [k, v], ... ]
	const kvs = options.alias || {};
	const aliases = Object.keys(kvs).reduce((p, k) => (p.push([ k, kvs[k] ]), p), []); // eslint-disable-line no-sequences

	let preserveSymlinks;

	return {
		name: 'node-resolve',

		options ( options ) {
			preserveSymlinks = options.preserveSymlinks;
		},

		generateBundle () {
			isFileCache = {};
			readFileCache = {};
		},

		resolveId ( importee, importer ) {
			if ( /\0/.test( importee ) ) return null; // ignore IDs with null character, these belong to other plugins

			const basedir = importer ? dirname( importer ) : process.cwd();

			// check aliases first
			if (aliases.length) {
				const alias = resolveAliases(importee, aliases);
				if (alias) {
					importee = alias;
				}
			}

			// https://github.com/defunctzombie/package-browser-field-spec
			if (mainFields.includes('browser') && browserMapCache[importer]) {
				const resolvedImportee = resolve( basedir, importee );
				const browser = browserMapCache[importer];
				if (browser[importee] === false || browser[resolvedImportee] === false) {
					return ES6_BROWSER_EMPTY;
				}
				if (browser[importee] || browser[resolvedImportee] || browser[resolvedImportee + '.js'] || browser[resolvedImportee + '.json']) {
					importee = browser[importee] || browser[resolvedImportee] || browser[resolvedImportee + '.js'] || browser[resolvedImportee + '.json'];
				}
			}


			const parts = importee.split( /[/\\]/ );
			let id = parts.shift();

			if ( id[0] === '@' && parts.length ) {
				// scoped packages
				id += `/${parts.shift()}`;
			} else if ( id[0] === '.' ) {
				// an import relative to the parent dir of the importer
				id = resolve( basedir, importee );
			}

			if (only && !only.some(pattern => pattern.test(id))) return null;

			let disregardResult = false;
			let packageBrowserField = false;
			const extensions = options.extensions || DEFAULT_EXTS;

			const resolveOptions = {
				basedir,
				packageFilter ( pkg, pkgPath ) {
					const pkgRoot = dirname( pkgPath );
					if (mainFields.includes('browser') && typeof pkg[ 'browser' ] === 'object') {
						packageBrowserField = Object.keys(pkg[ 'browser' ]).reduce((browser, key) => {
							const resolved = pkg[ 'browser' ][ key ] === false ? false : resolve( pkgRoot, pkg[ 'browser' ][ key ] );
							browser[ key ] = resolved;
							if ( key[0] === '.' ) {
								const absoluteKey = resolve( pkgRoot, key );
								browser[ absoluteKey ] = resolved;
								if ( !extname(key) ) {
									extensions.reduce( ( browser, ext ) => {
										browser[ absoluteKey + ext ] = browser[ key ];
										return browser;
									}, browser );
								}
							}
							return browser;
						}, {});
					}

					let overriddenMain = false;
					for ( const i in mainFields ) {
						const field = mainFields[i];
						if ( field !== 'main' && typeof pkg[ field ] === 'string' ) {
							pkg[ 'main' ] = pkg[ field ];
							overriddenMain = true;
							break;
						}
					}
					if ( overriddenMain === false && mainFields.indexOf( 'main' ) === -1 ) {
						disregardResult = true;
					}
					return pkg;
				},
				readFile: cachedReadFile,
				isFile: cachedIsFile,
				extensions: extensions
			};

			if (preserveSymlinks !== undefined) {
				resolveOptions.preserveSymlinks = preserveSymlinks;
			}

			return resolveIdAsync(
				importee,
				Object.assign( resolveOptions, customResolveOptions )
			)
				.then(resolved => {
					if ( resolved && mainFields.includes('browser') && packageBrowserField ) {
						if ( packageBrowserField.hasOwnProperty(resolved) ) {
							if (!packageBrowserField[resolved]) {
								browserMapCache[resolved] = packageBrowserField;
								return ES6_BROWSER_EMPTY;
							}
							resolved = packageBrowserField[ resolved ];
						}
						browserMapCache[resolved] = packageBrowserField;
					}

					if ( !disregardResult ) {
						if ( !preserveSymlinks && resolved && fs.existsSync( resolved ) ) {
							resolved = fs.realpathSync( resolved );
						}

						if ( ~builtins.indexOf( resolved ) ) {
							return null;
						} else if ( ~builtins.indexOf( importee ) && preferBuiltins ) {
							if ( !isPreferBuiltinsSet ) {
								this.warn(
									`preferring built-in module '${importee}' over local alternative ` +
									`at '${resolved}', pass 'preferBuiltins: false' to disable this ` +
									`behavior or 'preferBuiltins: true' to disable this warning`
								);
							}
							return null;
						} else if ( jail && resolved.indexOf( normalize( jail.trim( sep ) ) ) !== 0 ) {
							return null;
						}
					}

					if ( resolved && options.modulesOnly ) {
						return readFileAsync( resolved, 'utf-8').then(code => isModule( code ) ? resolved : null);
					} else {
						return resolved;
					}
				})
				.catch(() => null);
		}
	};
}
