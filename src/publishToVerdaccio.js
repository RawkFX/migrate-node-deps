const fs = require('fs');
const { execSync } = require('child_process');
const { parsePackageSpec, checkPackageExists, getPackageMetadata, resolveVersionRange, log } = require('./helpers');

/**
 * Publish a package to Verdaccio with improved error handling and retry logic
 * 
 * @param {string} packageSpec Package specification (name@version)
 * @param {Object} options Configuration options
 * @returns {Promise<string>} Result: 'published', 'skipped', or 'failed'
 */
async function publishToVerdaccio(packageSpec, options) {
    const { 
        verdaccioRegistry, 
        sourceRegistry, 
        skipExisting = true, 
        verbose = false,
        maxRetries = 3
    } = options;

    // Parse package name and version from packageSpec
    const parsedPackage = parsePackageSpec(packageSpec);
    let packageName = parsedPackage.name;
    let packageVersion = parsedPackage.version;

    // Handle version ranges by resolving to a specific version
    if (packageVersion && (packageVersion.includes('>=') || packageVersion.includes('^') ||
        packageVersion.includes('~') || packageVersion.includes('*'))) {
        log(`Resolving version range ${packageVersion} for ${packageName}`, verbose);
        try {
            const metadata = await getPackageMetadata(packageName, sourceRegistry, {
                retries: 3,
                timeout: 15000
            });
            const resolvedVersion = resolveVersionRange(metadata, packageVersion);
            if (!resolvedVersion) {
                throw new Error(`Could not resolve version range ${packageVersion}`);
            }
            log(`Resolved ${packageVersion} to ${resolvedVersion}`, verbose);
            packageVersion = resolvedVersion;
            packageSpec = `${packageName}@${packageVersion}`;
        } catch (error) {
            console.error(`Failed to resolve version for ${packageSpec}: ${error.message}`);
            return 'failed';
        }
    }

    // Check if package already exists in Verdaccio
    if (skipExisting) {
        try {
            const exists = await checkPackageExists(packageName, packageVersion, verdaccioRegistry, {
                retries: 2,
                timeout: 10000
            });
            if (exists) {
                log(`Package ${packageSpec} already exists in registry, skipping.`, verbose);
                return 'skipped';
            }
        } catch (error) {
            log(`Error checking if package exists: ${error.message}`, verbose);
            // Continue anyway
        }
    }

    // Retry publishing logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Download the package from source registry
            log(`Downloading ${packageSpec} (attempt ${attempt}/${maxRetries})`, verbose);
            
            // Set registry to source for downloading
            execSync(`npm config set registry ${sourceRegistry}`, { stdio: 'ignore' });
            execSync('npm config set strict-ssl false', { stdio: 'ignore' });

            // Pack the package with increased timeout
            const packCmd = `npm pack ${packageSpec} --quiet`;
            const npmOutput = execSync(packCmd, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 60000 // 60 seconds timeout
            }).trim();

            // Find the tarball file
            const tarballFile = npmOutput.split('\n').pop().trim();
            log(`Downloaded tarball: ${tarballFile}`, verbose);

            if (!fs.existsSync(tarballFile)) {
                throw new Error(`Tarball file not found: ${tarballFile}`);
            }

            // Publish to Verdaccio
            log(`Publishing ${packageSpec} to registry (attempt ${attempt}/${maxRetries})`, verbose);
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
                execSync(`npm publish ${tarballFile} --registry ${verdaccioRegistry} --access=public --tag ${tag}`, {
                    stdio: 'pipe',  // Capture output instead of inheriting
                    timeout: 30000  // 30 seconds timeout
                });

                // Clean up tarball file
                if (fs.existsSync(tarballFile)) {
                    fs.unlinkSync(tarballFile);
                }

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
                    // Clean up tarball if it exists
                    if (fs.existsSync(tarballFile)) {
                        fs.unlinkSync(tarballFile);
                    }
                    
                    if (attempt < maxRetries) {
                        // Log error and continue to next attempt
                        log(`Error publishing ${packageSpec} (attempt ${attempt}): ${error.message}. Retrying...`, verbose);
                        // Wait before next attempt (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                        continue;
                    }
                    throw error; // Throw on final attempt
                }
            }
        } catch (error) {
            if (attempt < maxRetries) {
                log(`Failed to process ${packageSpec} (attempt ${attempt}): ${error.message}. Retrying...`, verbose);
                // Wait before next attempt (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            } else {
                throw new Error(`Failed to publish ${packageSpec} after ${maxRetries} attempts: ${error.message}`);
            }
        }
    }
    
    return 'failed';
}

module.exports = { publishToVerdaccio };
