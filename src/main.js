const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);
const os = require('os');
const {execSync} = require('child_process');
const constants = require('./constants');
const {parseArgs, authenticateRegistry, log} = require('./helpers');
const {collectDependencies} = require('./collectDependencies');
const {publishToRegistry} = require('./publishToRegistry');
const glob = require('glob');
const yaml = require('js-yaml');

// Display help information
function showHelp() {
    console.log(`
Usage: migrate-node-deps [options]

Options:
  --lockfile <path>        Path to package-lock.json file (default: ./package-lock.json)
  --registry <url>         Private registry URL (default: http://localhost:4873)
  --source <url>           Source registry URL (default: https://registry.npmjs.org)
  --scope <scope>          Optional scope to limit cloning (e.g. @myorg)
  --concurrent <number>    Number of concurrent package downloads (default: 5)
  --skip-existing          Skip packages that already exist in private registry (default: true)
  --export-dir <path>      Save downloaded tarballs to this directory before deleting (useful for offline transfer)
  --import-dir <path>      Publish all tarballs (.tgz) from a directory to the private registry (offline machine mode)
  --verbose                Enable verbose logging
  --help                   Show this help message
  --requireLogin           Require login to private registry before publishing
  --username <username>    Username for non-interactive login
  --password <password>    Password for non-interactive login
  --email <email>          Email for non-interactive login
`);
}

// Main application
async function main() {
    // Store the original npm registry
    const originalRegistry = execSync('pnpm config get registry', {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || 'https://registry.npmjs.org/';

    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const options = parseArgs(args);

        // Show help if requested
        if (options.help) {
            showHelp();
            return;
        }

        // Determine the original working directory (where the npx command was run)
        const executionDir = process.env.INIT_CWD || process.cwd();

        // Setup configuration from options or defaults
        const config = {
            lockfilePath: options['lockfile'] ? path.resolve(executionDir, options['lockfile']) : path.resolve(executionDir, constants.DEFAULT_LOCKFILE_PATH),
            defaultRegistry: options.registry || constants.DEFAULT_REGISTRY,
            sourceRegistry: options.source || constants.DEFAULT_SOURCE_REGISTRY,
            scope: options.scope || null,
            concurrentLimit: options.concurrent ? parseInt(options.concurrent) : constants.DEFAULT_CONCURRENT_LIMIT,
            skipExisting: options['skip-existing'] !== 'false',
            exportDir: options['export-dir'] ? path.resolve(executionDir, options['export-dir']) : null,
            importDir: options['import-dir'] ? path.resolve(executionDir, options['import-dir']) : null,
            verbose: options.verbose || false,
            requireLogin: options.requireLogin || false,
            username: options.username || null,
            password: options.password || null,
            email: options.email || null,
        };

        console.log('Starting direct package cloning process using package-lock.json...');
        console.log(`Source registry: ${config.sourceRegistry}`);
        console.log(`Target registry: ${config.defaultRegistry}`);

        // Check if authentication is required
        if (config.requireLogin) {
            console.log(`Authenticating to private registry`);
            await authenticateRegistry(config.defaultRegistry, {
                username: config.username, password: config.password, email: config.email, verbose: config.verbose
            });
        }

        if (config.importDir) {
            console.log(`Import mode: Publishing tarballs from ${config.importDir} to ${config.defaultRegistry}`);
            if (!fs.existsSync(config.importDir)) {
                console.error(`Import directory does not exist: ${config.importDir}`);
                return;
            }
            const tarballs = fs.readdirSync(config.importDir).filter(f => f.endsWith('.tgz'));
            if (tarballs.length === 0) {
                console.log('No .tgz files found in the import directory.');
            } else {
                console.log(`Found ${tarballs.length} tarballs to publish.`);
                let successCount = 0;
                let skipCount = 0;
                let failCount = 0;
                for (const file of tarballs) {
                    const tarballPath = path.join(config.importDir, file);
                    console.log(`Publishing ${file}...`);
                    try {
                        execSync(`pnpm publish "${tarballPath}" --registry ${config.defaultRegistry} --access=public --no-provenance`, { stdio: 'pipe' });
                        console.log(`Successfully published ${file}`);
                        successCount++;
                    } catch (err) {
                        const errMsg = err.message || err.stderr?.toString() || err.stdout?.toString() || '';
                        if (errMsg.includes('already exists') || errMsg.includes('previously published version') || errMsg.includes('403') || errMsg.includes('EPUBLISHCONFLICT')) {
                            console.log(`Skipped ${file} (already exists in registry)`);
                            skipCount++;
                        } else {
                            console.error(`Failed to publish ${file}:`, errMsg);
                            failCount++;
                        }
                    }
                }
                console.log(`Offline publish complete. Success: ${successCount}, Skipped: ${skipCount}, Failed: ${failCount}`);
            }
            execSync(`pnpm config set registry ${originalRegistry}`);
            return;
        }

        const allPackages = new Set();

        console.log('Searching for package-lock.json and pnpm-lock.yaml files recursively...');
        const lockfiles = glob.sync('**/{package-lock.json,pnpm-lock.yaml}', {
            cwd: executionDir,
            ignore: ['**/node_modules/**']
        });

        console.log(`Found ${lockfiles.length} lockfiles:`, lockfiles);

        for (const file of lockfiles) {
            const filePath = path.resolve(executionDir, file);
            const content = await readFile(filePath, 'utf8');
            try {
                if (file.endsWith('.json')) {
                    const lockFile = JSON.parse(content);
                    if (lockFile.packages) {
                        for (const [pkgPath, pkg] of Object.entries(lockFile.packages)) {
                            if (pkgPath && pkg.version && !pkg.link) {
                                const namePart = pkg.name || pkgPath.split('node_modules/').pop();
                                allPackages.add(`${namePart}@${pkg.version}`);
                            }
                        }
                    } else if (lockFile.dependencies) {
                        for (const [name, pkg] of Object.entries(lockFile.dependencies)) {
                            if (pkg.version) allPackages.add(`${name}@${pkg.version}`);
                        }
                    }
                } else if (file.endsWith('.yaml')) {
                    const parsed = yaml.load(content);
                    if (parsed && parsed.packages) {
                        for (const key of Object.keys(parsed.packages)) {
                            // Extract name and version from pnpm key format like /pkg@version
                            const match = key.match(/^\/?(@?[^@]+)@([^@]+)/);
                            if (match) {
                                const cleanVersion = match[2].split('(')[0];
                                allPackages.add(`${match[1]}@${cleanVersion}`);
                            } else if (key.includes('@')) {
                                let parts = key.split('@');
                                if (key.startsWith('/@') && parts.length >= 3) {
                                    allPackages.add(`@${parts[1]}@${parts[2].split('(')[0]}`);
                                } else if (parts.length >= 2) {
                                  allPackages.add(`${parts[0].replace(/^\//,'')}@${parts[1].split('(')[0]}`);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`Error parsing ${filePath}: ${err.message}`);
            }
        }

        const packageJsonFiles = glob.sync('**/package.json', {
            cwd: executionDir,
            ignore: ['**/node_modules/**']
        });

        for (const file of packageJsonFiles) {
            const filePath = path.resolve(executionDir, file);
            try {
                const pkg = JSON.parse(await readFile(filePath, 'utf8'));
                for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'resolutions']) {
                    if (pkg[field]) {
                        for (const [name, version] of Object.entries(pkg[field])) {
                            // Only add simple exact versions or numeric versions to the sets for simple fetching
                            const cleanVersion = version.replace(/^[~^>=<]+/, '').split(' ')[0];
                            if (/^\d+\.\d+/.test(cleanVersion)) {
                                allPackages.add(`${name}@${cleanVersion}`);
                            }
                        }
                    }
                }
            } catch (e) {
                // ignore invalid
            }
        }
        if (allPackages.size === 0) {
            console.log('No dependencies found to migrate.');
            return;
        }

        console.log(`Found ${allPackages.size} unique package specifications to migrate.`);

        // Create temp directory for working
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'migrate-node-deps-'));
        console.log(`Created temporary directory: ${tempDir}`);

        try {
            // Change to temp directory
            const originalDir = process.cwd();
            process.chdir(tempDir);

            // Create package.json in temp directory
            await writeFile('package.json', JSON.stringify({
                name: 'migrate-node-deps-temp', version: '1.0.0', private: true
            }));

            console.log(`Preparing to publish ${allPackages.size} total packages...`);

            let publishedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;

            // Process each package for publishing with improved error handling
            const sortedPackages = Array.from(allPackages);
            console.log('Publishing packages to private registry...');

            // Process in smaller batches for publishing to avoid overwhelming the network
            const publishBatchSize = Math.min(5, config.concurrentLimit);
            for (let i = 0; i < sortedPackages.length; i += publishBatchSize) {
                const currentBatch = sortedPackages.slice(i, i + publishBatchSize);
                const publishPromises = [];
                for (const pkg of currentBatch) {
                    publishPromises.push(publishToRegistry(pkg, {
                        defaultRegistry: config.defaultRegistry,
                        sourceRegistry: config.sourceRegistry,
                        skipExisting: config.skipExisting,
                        exportDir: config.exportDir,
                        verbose: config.verbose
                    }).then(result => {
                        if (result === 'published') {
                            publishedCount++;
                        } else if (result === 'skipped') {
                            skippedCount++;
                        } else {
                            failedCount++;
                        }
                        return result;
                    })
                    .catch(error => {
                        console.error(`Failed to publish ${pkg}: ${error.message}`);
                        failedCount++;
                        return 'failed';
                    }));
                }

                // Wait for all publish operations to complete
                await Promise.all(publishPromises);

                // Show progress every few packages
                if (i % 20 === 0 || i + publishBatchSize >= sortedPackages.length) {
                    console.log(`Publishing progress: ${Math.min(i + publishBatchSize, sortedPackages.length)}/${sortedPackages.length}`);
                }

                // Small delay between batches to prevent overwhelming the server
                if (i + publishBatchSize < sortedPackages.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`
            Migration operation completed:
            - Total packages processed: ${allPackages.size}
            - Successfully published: ${publishedCount}
            - Skipped (already exists): ${skippedCount}
            - Failed: ${failedCount}
            `);

            // Change back to original directory
            process.chdir(originalDir);
        } finally {
            // Reset npm registry to the original one
            execSync(`pnpm config set registry ${originalRegistry}`);
            console.log(`Restored original pnpm registry: ${originalRegistry}`);

            // Clean up
            try {
                await rm(tempDir);
                console.log(`Cleaned up temporary directory: ${tempDir}`);
            } catch (error) {
                if (error.code === 'EBUSY' || error.code === 'EPERM') {
                    console.log(`Temporary directory is busy, will clean up on next run: ${tempDir}`);
                    console.log(`You may need to manually delete: ${tempDir}`);
                } else {
                    console.error(`Failed to remove temporary directory: ${tempDir}`, error);
                }
            }
        }
    } catch (error) {
        execSync(`pnpm config set registry ${originalRegistry}`);
        console.log(`Restored original pnpm registry: ${originalRegistry}`);

        console.error('Error:', error.message);
        throw error; // Re-throw to be caught by the CLI entry point
    }
}

module.exports = {main};
