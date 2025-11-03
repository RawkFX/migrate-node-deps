# migrate-node-deps
<div>

[![npm version](https://img.shields.io/npm/v/migrate-node-deps.svg?style=flat-square)](https://www.npmjs.com/package/migrate-node-deps)
[![install size](https://packagephobia.com/badge?p=migrate-node-deps)](https://packagephobia.com/result?p=migrate-node-deps)
[![npm downloads](https://img.shields.io/npm/dm/migrate-node-deps.svg?style=flat-square)](https://npm-stat.com/charts.html?package=migrate-node-deps)

</div>

A command-line tool to migrate npm packages and their dependencies to a local private registry (like Verdaccio) without installing
them, avoiding dependency conflicts.

## Installation

To use the library, use the following command:

```bash
npx migrate-node-deps [options]
```

## Features

- Migrates all dependencies from a package.json to a local private (like Verdaccio) registry
- Handles transitive dependencies
- Supports scoped packages
- Configurable concurrency for better performance
- Skip packages that already exist in the target registry
- Authentication support for private registries

## Usage

To use the `migrate-node-deps` command, run:

```bash
npx migrate-node-deps [options]
```

### Options

| Option                  | Description                                                             | Default                      |
|-------------------------|-------------------------------------------------------------------------|------------------------------|
| `--lockfile <path>`     | Path to npm lockfile (package-lock.json)                                | `./package-lock.json`        |
| `--registry <url>`      | Target private registry URL                                              | `http://localhost:4873`      |
| `--source <url>`        | Source registry URL (where packages are downloaded from)                 | `https://registry.npmjs.org` |
| `--scope <scope>`       | Optional scope to limit cloning (e.g., `@myorg`)                         | `null`                       |
| `--concurrent <number>` | Number of concurrent package downloads (used as a hint)                  | `5`                          |
| `--skip-existing`       | Skip packages that already exist in the target registry                  | `true`                       |
| `--requireLogin`        | Require login to the private registry before publishing                  | `false`                      |
| `--username <username>` | Username for non-interactive login                                       | `null`                       |
| `--password <password>` | Password for non-interactive login                                       | `null`                       |
| `--email <email>`       | Email for non-interactive login                                          | `null`                       |
| `--verbose`             | Enable verbose logging                                                    | `false`                      |
| `--help`                | Show help                                                                | -                            |

## Examples

**Basic usage (migrate using lockfile in current directory):**

```bash
npx migrate-node-deps
```

**Specify a custom lockfile and target registry:**

```bash
npx migrate-node-deps --lockfile ./package-lock.json --registry http://my-verdaccio:4873
```

**Only migrate packages under a scope:**

```bash
npx migrate-node-deps --lockfile ./package-lock.json --scope @myorg
```

**Require login and provide credentials non-interactively:**

```bash
npx migrate-node-deps --requireLogin --username admin --password secret --registry http://my-verdaccio:4873
```

**Enable verbose logging and increase concurrency:**

```bash
npx migrate-node-deps --verbose --concurrent 10
```

## How It Works

1. Reads the specified `package-lock.json` (lockfile v2/v3 produced by npm v7+)
2. Collects all direct and transitive dependencies from the lockfile
3. Optionally filters packages by a provided `--scope`
4. Packs packages from the source registry and publishes them to the target registry

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## Author

- [@RawkFX](https://github.com/RawkFX)

## Repository

[GitHub Repository](https://github.com/RawkFX/migrate-node-deps)

## Bugs

For bug reports, please visit the [issues page](https://github.com/RawkFX/migrate-node-deps/issues).

## Keywords

- Node.js
- npm
- Verdaccio
- Dependency Management
