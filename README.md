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

- Works with `pnpm` natively
- Deep scanning for both `package-lock.json` and `pnpm-lock.yaml` across all subdirectories
- Offline migration support via `--export-dir` (online) and `--import-dir` (offline) modes
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
| `--export-dir <path>`   | Save downloaded tarballs to this directory before deleting               | `null`                       |
| `--import-dir <path>`   | Publish offline tarballs directly to the target registry                 | `null`                       |
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

### Offline Migration Example

**Step 1: Export tarballs on a machine with internet access**
```bash
npx migrate-node-deps --export-dir ./usb-drive/tarballs
```

**Step 2: Transfer the directory to the offline machine and import them**
```bash
npx migrate-node-deps --import-dir ./usb-drive/tarballs --registry http://localhost:4873
```

## How It Works

1. Recursively finds all `package-lock.json`, `pnpm-lock.yaml`, and `package.json` files in the working directory
2. Collects all direct and transitive dependencies from the files
3. Optionally filters packages by a provided `--scope`
4. Uses `npm pack` to download tarballs from the source and `pnpm publish` to push them to the target registry

## Built Binaries

You can build standalone binaries across multiple OS architectures with Node 18 by running:
```bash
pnpm build
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
