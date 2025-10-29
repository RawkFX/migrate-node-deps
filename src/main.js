const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);
const os = require('os');
const { execSync } = require('child_process');

const constants = require('./constants');
const { parseArgs, authenticateVerdaccio, log } = require('./helpers');
const { collectDependencies } = require('./collectDependencies');
const { publishToVerdaccio } = require('./publishToVerdaccio');

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
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const options = parseArgs(args);

        // Show help if requested
        if (options.help) {
            showHelp();
            return;
        }

        // Store the original npm registry
        const originalRegistry = execSync('npm config get registry', { encoding: 'utf8' }).trim();

        // Setup configuration from options or defaults
        const config = {
            lockfilePath: options['lockfile'] || constants.DEFAULT_LOCKFILE_PATH,
            verdaccioRegistry: options.registry || constants.DEFAULT_VERDACCIO_REGISTRY,
            sourceRegistry: options.source || constants.DEFAULT_SOURCE_REGISTRY,
            scope: options.scope || null,
            concurrentLimit: options.concurrent ? parseInt(options.concurrent) : constants.DEFAULT_CONCURRENT_LIMIT,
            skipExisting: options['skip-existing'] !== 'false',
            verbose: options.verbose || false,
            requireLogin: options.requireLogin || false,
            username: options.username || null,
            password: options.password || null,
            email: options.email || null,
        };

        console.log('Starting direct package cloning process using package-lock.json...');
        console.log(`Source registry: ${config.sourceRegistry}`);
        console.log(`Target registry: ${config.verdaccioRegistry}`);

        // Check if authentication is required
        if (config.requireLogin) {
            console.log(`Authenticating to private registry`);
            await authenticateVerdaccio(config.verdaccioRegistry, {
                username: config.username,
                password: config.password,
                email: config.email,
                verbose: config.verbose
            });
        }

        // Read package-lock.json
        const lockFile = JSON.parse(await readFile(config.lockfilePath, 'utf8'));

        // Create temp directory for working
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'migrate-node-deps-'));
        console.log(`Created temporary directory: ${tempDir}`);

        try {
            // Change to temp directory
            const originalDir = process.cwd();
            process.chdir(tempDir);

            // Create package.json in temp directory
            await writeFile('package.json', JSON.stringify({
                name: 'migrate-node-deps-temp',
                version: '1.0.0',
                private: true
            }));

            // Collect all dependencies from lockfile
            const dependencies = collectDependencies(lockFile, {
                scope: config.scope
            });

            if (dependencies.length === 0) {
                console.log('No dependencies found in lockfile to migrate.');
                return;
            }

            console.log(`Found ${dependencies.length} total dependencies (direct and transitive) in lockfile`);

            // Download and publish packages
            const allPackages = new Set();

            // Add initial packages to tracking
            for (const pkg of dependencies) {
                allPackages.add(`${pkg.name}@${pkg.version}`);
            }

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
                const publishPromises = currentBatch.map(packageSpec =>
                    publishToVerdaccio(packageSpec, {
                        verdaccioRegistry: config.verdaccioRegistry,
                        sourceRegistry: config.sourceRegistry,
                        skipExisting: config.skipExisting,
                        verbose: config.verbose,
                        maxRetries: 3
                    })
                        .then(result => {
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
                            console.error(`Failed to publish ${packageSpec}: ${error.message}`);
                            failedCount++;
                            return 'failed';
                        })
                );

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
            execSync(`npm config set registry ${originalRegistry}`);
            console.log(`Restored original npm registry: ${originalRegistry}`);

            // Clean up
            try {
                await rm(tempDir, { recursive: true, force: true });
                console.log(`Cleaned up temporary directory: ${tempDir}`);
            } catch (error) {
                if (error.code === 'EBUSY' || error.code === 'EPERM') {
                    console.log(`Temporary directory is busy, will clean up on next run: ${tempDir}`);
                    console.log(`You may need to manually delete: ${tempDir}`);
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        throw error; // Re-throw to be caught by the CLI entry point
    }
}

module.exports = { main };