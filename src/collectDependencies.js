/**
 * Helper function to collect dependencies from package-lock.json
 * * @param {Object} lockFileContents package-lock.json contents
 * @param lockFileContents .packages Object containing package details
 * @param {Object} options Configuration options
 * @returns {Array} Array of dependencies
 */
function collectDependencies(lockFileContents, options) {
    const {scope} = options;
    const dependencies = new Map();

    if (!lockFileContents.packages) {
        throw new Error("The package-lock.json format is not supported or is invalid. " +
            "Please use npm v7+ to generate a lockfile v2 or v3.");
    }

    // Iterate over the 'packages' key which contains a flat list of all dependencies
    for (const [path, details] of Object.entries(lockFileContents.packages)) {

        // Skip the root entry (the current project)
        if (path === "") {
            continue;
        }

        const name = details.name;
        const version = details.version;

        // Skip entries that don't have a name or version (e.g. simple folders)
        if (!name || !version) {
            continue;
        }

        // Skip packages that are symbolic links (e.g. 'npm link')
        if (details.link === true) {
            continue;
        }

        // Apply 'scope' filter if specified
        if (scope && !name.startsWith(scope)) {
            continue;
        }

        // Add to map (the key prevents duplicates)
        const packageSpec = `${name}@${version}`;
        dependencies.set(packageSpec, {name, version});
    }

    // Return an array with the values
    return Array.from(dependencies.values());
}

module.exports = {collectDependencies};