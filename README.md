# migrate-node-deps
<div>

[![npm version](https://img.shields.io/npm/v/migrate-node-deps.svg?style=flat-square)](https://www.npmjs.com/package/migrate-node-deps)
[![install size](https://packagephobia.com/badge?p=migrate-node-deps)](https://packagephobia.com/result?p=migrate-node-deps)
[![npm downloads](https://img.shields.io/npm/dm/migrate-node-deps.svg?style=flat-square)](https://npm-stat.com/charts.html?package=migrate-node-deps)

</div>

A command-line tool to migrate npm packages and their dependencies to a local Verdaccio registry without installing
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
| `--package-json <path>` | Path to package.json file                                               | `./package.json`             |
| `--registry <url>`      | Private registry URL                                                   | `http://localhost:4873`      |
| `--source <url>`        | Source registry URL                                                   | `https://registry.npmjs.org` |
| `--include-dev`         | Include devDependencies                                                 | `true`                       |
| `--include-peer`        | Include peerDependencies                                                | `true`                       |
| `--scope <scope>`       | Optional scope to limit cloning (e.g., @myorg)                         | `null`                       |
| `--concurrent <number>` | Number of concurrent package downloads                                  | `5`                          |
| `--skip-existing`       | Skip packages that already exist in private registry                   | `true`                       |
| `--requireLogin`        | Require login to private registry before publishing                    | `false`                      |
| `--username <username>` | Username for non-interactive login                                      | `null`                       |
| `--password <password>` | Password for non-interactive login                                      | `null`                       |
| `--help`                | Show help message                                                      | -                            |

## Examples

**Basic usage (migrate all dependencies):**

```bash
npx migrate-node-deps
```

**Specify a custom package.json file:**

```bash
npx migrate-node-deps --package-json ./path/to/package.json
```

**Use a different private registry:**

```bash
npx migrate-node-deps --registry http://my-verdaccio-server:4873
```

**Only migrate a specific scope:**

```bash
npx migrate-node-deps --scope @myorg
```

**Skip dev dependencies:**

```bash
npx migrate-node-deps --include-dev false
```

**Increase concurrent downloads for faster migration:**

```bash
npx migrate-node-deps --concurrent 10
```

**Enable verbose logging:**

```bash
npx migrate-node-deps --verbose
```

**With authentication:**

```bash
npx migrate-node-deps --requireLogin --username admin --password secret
```

## How It Works

1. Reads the specified `package.json` file
2. Collects all direct dependencies (and optionally devDependencies, peerDependencies, optionalDependencies)
3. Resolves all transitive dependencies recursively
4. Downloads packages from the source registry
5. Publishes them to the target private registry

## Development

To build and test the library locally, use the following commands:

```bash
npm run test # Run tests
```

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