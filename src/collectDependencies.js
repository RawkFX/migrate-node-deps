// Helper function to collect dependencies from package.json
function collectDependencies(packageJson, options) {
    const { includeDevDeps, includePeerDeps, includeOptionalDeps, scope } = options;
    const dependencies = [];

    // Helper to add deps from an object
    const addDeps = (deps) => {
        if (!deps) return;

        for (const [name, version] of Object.entries(deps)) {
            // Skip if scope is specified and package doesn't match
            if (scope && !name.startsWith(scope)) continue;

            dependencies.push({ name, version });
        }
    };

    // Add regular dependencies
    addDeps(packageJson.dependencies);

    // Add devDependencies if requested
    if (includeDevDeps) {
        addDeps(packageJson.devDependencies);
    }

    // Add peerDependencies if requested
    if (includePeerDeps) {
        addDeps(packageJson.peerDependencies);
    }

    // Add optionalDependencies if requested
    if (includeOptionalDeps) {
        addDeps(packageJson.optionalDependencies);
    }

    return dependencies;
}

module.exports = {
    collectDependencies
};
