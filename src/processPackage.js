const { getPackageMetadata, getExactVersion, getAllDependencies, log } = require('./helpers');

/**
 * Process a single package and its dependencies
 * 
 * @param {Object} pkg Package object with name and version
 * @param {Array} queue Queue to add new dependencies to
 * @param {Set} allPackages Set of all packages being processed
 * @param {Object} options Configuration options
 * @returns {Promise<void>}
 */
async function processPackage(pkg, queue, allPackages, options) {
    const { 
        sourceRegistry, 
        includePeerDeps, 
        includeOptionalDeps, 
        processedPackages, 
        verbose 
    } = options;
    
    const pkgKey = `${pkg.name}@${pkg.version}`;

    // Skip if already processed
    if (processedPackages.has(pkgKey)) {
        return;
    }

    // Mark as processed
    processedPackages.add(pkgKey);

    try {
        log(`Processing ${pkgKey}`, verbose);

        // Get package metadata from source registry with retries
        const metadata = await getPackageMetadata(pkg.name, sourceRegistry, {
            retries: 3,
            timeout: 10000
        });

        // Get exact version
        const exactVersion = getExactVersion(metadata, pkg.version);
        if (!exactVersion) {
            console.error(`Could not resolve version ${pkg.version} for ${pkg.name}`);
            return;
        }

        const exactPkgKey = `${pkg.name}@${exactVersion}`;

        // Get all dependencies for this package
        const allDeps = getAllDependencies(metadata, exactVersion, {
            includePeerDeps,
            includeOptionalDeps
        });

        // Add new dependencies to queue and tracking
        for (const dep of allDeps) {
            const depKey = `${dep.name}@${dep.version}`;

            if (!processedPackages.has(depKey) && !Array.from(allPackages).some(p => p === depKey)) {
                queue.push(dep);
                allPackages.add(depKey);
            }
        }
    } catch (error) {
        console.error(`Error processing ${pkgKey}: ${error.message}`);
        // Don't propagate the error - we want to continue with other packages
    }
}

module.exports = { processPackage };
