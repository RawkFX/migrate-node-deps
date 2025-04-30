const { getPackageMetadata, getExactVersion, getAllDependencies } = require('./helpers');

// Process a single package
async function processPackage(pkg, queue, allPackages, options) {
    const { verbose, sourceRegistry, processedPackages } = options;
    const pkgKey = `${pkg.name}@${pkg.version}`;

    // Skip if already processed
    if (processedPackages.has(pkgKey)) {
        return;
    }

    // Mark as processed
    processedPackages.add(pkgKey);

    try {
        if (verbose) console.log(`Processing ${pkgKey}`);

        // Get package metadata from source registry
        const metadata = await getPackageMetadata(pkg.name, sourceRegistry);

        // Get exact version
        const exactVersion = getExactVersion(metadata, pkg.version);
        if (!exactVersion) {
            console.error(`Could not resolve version ${pkg.version} for ${pkg.name}`);
            return;
        }

        const exactPkgKey = `${pkg.name}@${exactVersion}`;

        // Get all dependencies for this package
        const allDeps = getAllDependencies(metadata, exactVersion, {
            includePeerDeps: options.includePeerDeps,
            includeOptionalDeps: options.includeOptionalDeps
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
    }
}

module.exports = {
    processPackage
};
