/**
 * Helper function to collect dependencies from package-lock.json v2/v3
 * @param {Object} lockFileContents package-lock.json contents
 * @param {Object} lockFileContents.packages Object containing package details
 * @param {Object} options Configuration options
 * @returns {Array} Array of dependencies { name: string, version: string }
 */
function collectDependencies(lockFileContents, options) {
    const { scope } = options;
    const dependencies = new Map();

    if (!lockFileContents || typeof lockFileContents.packages !== 'object') {
        throw new Error("The package-lock.json format is not supported or is invalid. " +
            "The 'packages' key is missing or invalid. Please use npm v7+ to generate a lockfile v2 or v3.");
    }

    // Iterate over the 'packages' key which contains a flat list of all dependencies
    for (const [pkgPath, details] of Object.entries(lockFileContents.packages)) {

        // Skip the root entry (the current project)
        if (pkgPath === "") {
            continue;
        }

        // Skip entries that don't have a version (can indicate workspaces, etc.)
        if (!details.version) {
            continue;
        }

        // Extract the package name from the path
        // Example paths: "node_modules/pkg-name", "node_modules/@scope/pkg-name"
        // Nested Example: "node_modules/pkg-a/node_modules/pkg-b"
        const pathParts = pkgPath.split('node_modules/');
        const name = pathParts[pathParts.length - 1]; // Get the last segment

        const version = details.version;

        // Skip packages that are symbolic links (e.g., 'npm link' or workspaces)
        if (details.link === true) {
            console.log(`Skipping linked package: ${name || pkgPath}`); // Log skipped links
            continue;
        }

        // Apply 'scope' filter if specified
        if (scope && !name.startsWith(scope)) {
            continue;
        }

        // Ensure we actually extracted a name (should always happen if version exists)
        if (!name) {
            console.warn(`Could not extract package name from path: ${pkgPath}`);
            continue;
        }

        // Add to map (the key prevents duplicates)
        const packageSpec = `${name}@${version}`;
        if (!dependencies.has(packageSpec)) {
            dependencies.set(packageSpec, { name, version });
        }
    }

    // Return an array with the values
    return Array.from(dependencies.values());
}

module.exports = { collectDependencies };