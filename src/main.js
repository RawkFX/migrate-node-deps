const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);
const os = require('os');

const constants = require('./constants');
const { parseArgs, authenticateVerdaccio, log } = require('./helpers');
const { collectDependencies } = require('./collectDependencies');
const { processPackage } = require('./processPackage');
const { publishToVerdaccio } = require('./publishToVerdaccio');

// Display help information
function showHelp() {
    console.log(`
Usage: migrate-node-deps [options]

Options:
  --package-json <path>    Path to package.json file (default: ./package.json)
  --registry <url>         Private registry URL (default: http://localhost:4873)
  --source <url>           Source registry URL (default: https://registry.npmjs.org)
  --include-dev            Include devDependencies (default: true)
  --include-peer           Include peerDependencies (default: true)
  --include-optional       Include optionalDependencies (default: true)
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

        // Setup configuration from options or defaults
        const config = {
            packageJsonPath: options['package-json'] || constants.DEFAULT_PACKAGE_JSON_PATH,
            verdaccioRegistry: options.registry || constants.DEFAULT_VERDACCIO_REGISTRY,
            sourceRegistry: options.source || constants.DEFAULT_SOURCE_REGISTRY,
            includeDevDeps: options['include-dev'] !== 'false' && constants.DEFAULT_INCLUDE_DEV,
            includePeerDeps: options['include-peer'] !== 'false' && constants.DEFAULT_INCLUDE_PEER,
            includeOptionalDeps: options['include-optional'] !== 'false' && constants.DEFAULT_INCLUDE_OPTIONAL,
            scope: options.scope || null,
            concurrentLimit: options.concurrent ? parseInt(options.concurrent) : constants.DEFAULT_CONCURRENT_LIMIT,
            skipExisting: options['skip-existing'] !== 'false',
            verbose: options.verbose || false,
            requireLogin: options.requireLogin || false,
            username: options.username || null,
            password: options.password || null,
            email: options.email || null,
            processedPackages: new Set()
        };

        console.log('Starting direct package cloning process...');
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

        // Read package.json
        const packageJson = JSON.parse(await readFile(config.packageJsonPath, 'utf8'));

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

            // Collect all initial dependencies to process
            const dependencies = collectDependencies(packageJson, {
                includeDevDeps: config.includeDevDeps,
                includePeerDeps: config.includePeerDeps,
                includeOptionalDeps: config.includeOptionalDeps,
                scope: config.scope
            });

            if (dependencies.length === 0) {
                console.log('No dependencies found to migrate.');
                return;
            }

            console.log(`Found ${dependencies.length} direct dependencies to process`);

            // Download and publish packages
            const packageQueue = [...dependencies];
            const allPackages = new Set();

            // Add initial packages to tracking
            for (const pkg of dependencies) {
                allPackages.add(`${pkg.name}@${pkg.version}`);
            }

            // Process packages and their dependencies
            console.log('Processing packages and their dependencies...');

            let publishedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;

            // Process packages in batches
            while (packageQueue.length > 0) {
                const batch = packageQueue.splice(0, config.concurrentLimit);
                const batchPromises = batch.map(pkg => 
                    processPackage(pkg, packageQueue, allPackages, {
                        sourceRegistry: config.sourceRegistry,
                        verdaccioRegistry: config.verdaccioRegistry,
                        includePeerDeps: config.includePeerDeps,
                        includeOptionalDeps: config.includeOptionalDeps,
                        processedPackages: config.processedPackages,
                        verbose: config.verbose
                    })
                );

                await Promise.all(batchPromises);

                console.log(`Progress: ${allPackages.size - packageQueue.length}/${allPackages.size} packages processed`);
            }

            console.log(`Discovered ${allPackages.size} total packages (including transitive dependencies)`);

            // Process each package for publishing
            const sortedPackages = Array.from(allPackages);
            console.log('Publishing packages to private registry...');

            for (let i = 0; i < sortedPackages.length; i++) {
                const packageSpec = sortedPackages[i];

                if (i % 10 === 0 || i === sortedPackages.length - 1) {
                    console.log(`Publishing progress: ${i + 1}/${sortedPackages.length}`);
                }

                try {
                    const result = await publishToVerdaccio(packageSpec, {
                        verdaccioRegistry: config.verdaccioRegistry,
                        sourceRegistry: config.sourceRegistry,
                        skipExisting: config.skipExisting,
                        verbose: config.verbose
                    });

                    if (result === 'published') {
                        publishedCount++;
                    } else if (result === 'skipped') {
                        skippedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (error) {
                    console.error(`Failed to publish ${packageSpec}: ${error.message}`);
                    failedCount++;
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
