const fs = require('fs');
const { execSync } = require('child_process');
const { getPackageMetadata, parsePackageSpec, resolveVersionRange, log } = require('./helpers');

// Publish a package to Verdaccio
async function publishToVerdaccio(packageSpec, options) {
    const { verdaccioRegistry, sourceRegistry, skipExisting, verbose } = options;
    
    // Parse package name and version from packageSpec
    const parsedPackage = parsePackageSpec(packageSpec);
    let packageName = parsedPackage.name;
    let packageVersion = parsedPackage.version;

    // Handle version ranges by resolving to a specific version
    if (packageVersion && (packageVersion.includes('>=') || packageVersion.includes('^') ||
        packageVersion.includes('~') || packageVersion.includes('*'))) {
        log(`Resolving version range ${packageVersion} for ${packageName}`, verbose);
        try {
            const metadata = await getPackageMetadata(packageName, sourceRegistry);
            const resolvedVersion = resolveVersionRange(metadata, packageVersion);
            if (!resolvedVersion) {
                throw new Error(`Could not resolve version range ${packageVersion}`);
            }
            log(`Resolved ${packageVersion} to ${resolvedVersion}`, verbose);
            packageVersion = resolvedVersion;
            packageSpec = `${packageName}@${packageVersion}`;
        } catch (error) {
            log(`Failed to resolve version for ${packageSpec}: ${error.message}`, verbose);
            return 'failed';
        }
    }

    // Check if package already exists in Verdaccio
    if (skipExisting) {
        try {
            const exists = await checkPackageExists(packageName, packageVersion, verdaccioRegistry);
            if (exists) {
                log(`Package ${packageSpec} already exists in registry, skipping.`, verbose);
                return 'skipped';
            }
        } catch (error) {
            log(`Error checking if package exists: ${error.message}`, verbose);
            // Continue anyway
        }
    }

    try {
        // Download the package from source registry
        log(`Downloading ${packageSpec}`, verbose);
        execSync(`npm config set registry ${sourceRegistry}`, { stdio: 'ignore' });
        execSync('npm config set strict-ssl false', { stdio: 'ignore' });

        // Ignore extraneous packages warnings from npm
        const npmOutput = execSync(`npm pack ${packageSpec} --quiet`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();

        // Find the tarball file
        const tarballFile = npmOutput.split('\n').pop().trim();

        log(`Downloaded tarball: ${tarballFile}`, verbose);

        if (!fs.existsSync(tarballFile)) {
            throw new Error(`Tarball file not found: ${tarballFile}`);
        }

        // Publish to Verdaccio
        log(`Publishing ${packageSpec} to registry`, verbose);
        execSync(`npm config set registry ${verdaccioRegistry}`, { stdio: 'ignore' });

        try {
            // Determine appropriate tag based on version
            const versionMatch = packageSpec.match(/@([^@]+)$/);
            const version = versionMatch ? versionMatch[1] : 'latest';

            // Use "latest" for regular releases, special tag for prereleases
            let tag = 'latest';
            if (version.includes('-')) {
                // Extract prerelease identifier (alpha, beta, rc, etc.)
                const prerelease = version.split('-')[1].split('.')[0];
                tag = prerelease || 'prerelease';
            }

            log(`Using tag: ${tag} for package ${packageSpec}`, verbose);

            // Using --access=public to ensure scoped packages publish correctly
            // Add --registry flag to ensure using correct registry
            // Add --tag flag to set the appropriate dist-tag
            execSync(`npm publish ${tarballFile} --registry ${verdaccioRegistry} --access=public --tag ${tag}`, {
                stdio: 'pipe'  // Capture output instead of inheriting to better handle errors
            });

            // Clean up tarball file
            fs.unlinkSync(tarballFile);

            return 'published';
        } catch (error) {
            // More comprehensive check for "already exists" errors
            if (error.message.includes('EPUBLISHCONFLICT') ||
                error.message.includes('already exists') ||
                error.message.includes('over the previously published version') ||
                error.message.includes('cannot publish over') ||
                error.message.includes('403')) {
                log(`Package ${packageSpec} already exists in registry.`, verbose);
                if (fs.existsSync(tarballFile)) {
                    fs.unlinkSync(tarballFile);
                }
                return 'skipped';
            } else {
                log(`Error details: ${error.message}`, verbose);
                // Don't throw here, just return a failure status
                if (fs.existsSync(tarballFile)) {
                    fs.unlinkSync(tarballFile);
                }
                return 'failed';
            }
        }
    } catch (error) {
        log(`Failed to publish ${packageSpec}: ${error.message}`, verbose);
        return 'failed';
    }
}

// Helper function to check if a package exists in the registry
async function checkPackageExists(packageName, version, registry) {
    return new Promise((resolve) => {
        try {
            const metadata = require('./helpers').getPackageMetadata(packageName, registry);
            // Check if version exists in registry
            resolve(metadata.versions && metadata.versions[version] !== undefined);
        } catch (error) {
            resolve(false);
        }
    });
}

module.exports = {
    publishToVerdaccio
};
