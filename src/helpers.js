const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// Helper function to log only in verbose mode
const log = (message, verbose = false) => {
    if (verbose) {
        console.log(message);
    }
};

// Helper function to parse command line arguments
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[key] = args[i + 1];
                i++;
            } else {
                result[key] = true;
            }
        }
    }
    return result;
}

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

// Helper function for authentication
/*
async function authenticateVerdaccio(registry, options = {}) {
    const { username, password, email, verbose } = options;
    
    execSync(`npm config set registry ${registry}`, { stdio: 'ignore' });

    try {
        // Check if already logged in
        const whoamiOutput = execSync('npm whoami', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
        log(`Already authenticated as ${whoamiOutput}`, verbose);
        return true;
    } catch (error) {
        // Not logged in, proceed with authentication
        log('Not authenticated, attempting login...', verbose);

        // Check if we have credentials for non-interactive login
        if (username && password) {
            try {
                // Use npm login with provided credentials
                const authParams = [
                    `--registry=${registry}`,
                    `--username=${username}`,
                    `--password=${password}`
                ];

                if (email) {
                    authParams.push(`--email=${email}`);
                }

                execSync(`npm-auth-to-token ${authParams.join(' ')}`, { stdio: 'ignore' });
                console.log(`Successfully authenticated to registry as ${username}`);
                return true;
            } catch (authError) {
                console.error(`Non-interactive authentication failed: ${authError.message}`);

                // If non-interactive fails and we're in a TTY, try interactive
                if (process.stdin.isTTY) {
                    console.log('Falling back to interactive login...');
                } else {
                    throw new Error('Authentication failed and interactive login not available');
                }
            }
        }

        // Interactive login as fallback
        if (process.stdin.isTTY) {
            try {
                console.log('Please enter your registry credentials:');
                execSync('npm login', { stdio: 'inherit' });
                console.log('Successfully authenticated to registry');
                return true;
            } catch (interactiveError) {
                throw new Error(`Interactive authentication failed: ${interactiveError.message}`);
            }
        } else {
            throw new Error('Authentication required but no credentials provided and not in interactive mode');
        }
    }
}
*/
/**
 * Authenticate with a Verdaccio registry
 * @param {string} registry - The URL of the registry
 * @param {Object} options - Authentication options
 * @param {string} options.username - Username for authentication
 * @param {string} options.password - Password for authentication
 * @param {string} options.email - Email for authentication
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<boolean>} - Whether authentication was successful
 */
async function authenticateVerdaccio(registry, options = {}) {
    const { username, password, email, verbose } = options;
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    // Helper function for logging
    const log = (message, shouldLog) => {
        if (shouldLog) {
            console.log(message);
        }
    };

    // Make sure registry URL doesn't have trailing slash
    const normalizedRegistry = registry.replace(/\/+$/, '');

    log(`Setting npm registry to ${normalizedRegistry}`, verbose);
    execSync(`npm config set registry ${normalizedRegistry}`, { stdio: 'ignore' });

    try {
        // Check if already logged in
        const whoamiOutput = execSync('npm whoami', {
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8'
        }).trim();

        log(`Already authenticated as ${whoamiOutput}`, verbose);
        return true;
    } catch (error) {
        log('Not authenticated, attempting login...', verbose);

        if (username && password) {
            try {
                // Get the registry hostname (without protocol)
                const registryHost = normalizedRegistry.replace(/^https?:\/\//, '');
                const npmrcPath = path.join(process.env.HOME || process.env.USERPROFILE, '.npmrc');

                // Create the proper _auth entry for .npmrc
                const authString = `${username}:${password}`;
                const authToken = Buffer.from(authString).toString('base64');

                // Read existing .npmrc content
                let npmrcContent = '';
                try {
                    npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
                } catch (e) {
                    // File doesn't exist, that's okay
                }

                // Remove any existing auth entries for this registry
                const registryAuthRegex = new RegExp(`//${registryHost}/:_auth.*\\n?`, 'g');
                const registryTokenRegex = new RegExp(`//${registryHost}/:_authToken.*\\n?`, 'g');
                npmrcContent = npmrcContent
                    .replace(registryAuthRegex, '')
                    .replace(registryTokenRegex, '');

                // Add the new auth entry
                const newAuthEntry = `//${registryHost}/:_auth=${authToken}\n`;
                if (email) {
                    npmrcContent += `//${registryHost}/:email=${email}\n`;
                }
                npmrcContent += newAuthEntry;

                // Write the updated content back to .npmrc
                fs.writeFileSync(npmrcPath, npmrcContent.trim() + '\n');

                // Verify the authentication worked
                try {
                    const verifiedUser = execSync('npm whoami', {
                        stdio: ['ignore', 'pipe', 'ignore'],
                        encoding: 'utf8'
                    }).trim();

                    log(`Successfully authenticated to registry as ${verifiedUser}`, verbose);
                    return true;
                } catch (verifyError) {
                    throw new Error(`Authentication failed verification: ${verifyError.message}`);
                }
            } catch (authError) {
                console.error(`Non-interactive authentication failed: ${authError.message}`);

                if (process.stdin.isTTY) {
                    console.log('Falling back to interactive login...');
                } else {
                    throw new Error('Authentication failed and interactive login not available');
                }
            }
        }

        // Interactive login as fallback
        if (process.stdin.isTTY) {
            try {
                console.log('Please enter your registry credentials:');
                execSync('npm login', { stdio: 'inherit' });

                // Verify login succeeded
                const verifiedUser = execSync('npm whoami', {
                    stdio: ['ignore', 'pipe', 'ignore'],
                    encoding: 'utf8'
                }).trim();

                console.log(`Successfully authenticated to registry as ${verifiedUser}`);
                return true;
            } catch (interactiveError) {
                throw new Error(`Interactive authentication failed: ${interactiveError.message}`);
            }
        } else {
            throw new Error('Authentication required but no credentials provided and not in interactive mode');
        }
    }
}
// Helper function to get package metadata from registry
async function getPackageMetadata(packageName, registry) {
    return new Promise((resolve, reject) => {
        const url = `${registry.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`;
        const isHttps = registry.startsWith('https:');
        const client = isHttps ? https : http;

        client.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const metadata = JSON.parse(data);
                        resolve(metadata);
                    } catch (error) {
                        reject(new Error(`Failed to parse metadata for ${packageName}: ${error.message}`));
                    }
                } else if (res.statusCode === 404) {
                    reject(new Error(`Package ${packageName} not found in registry`));
                } else {
                    reject(new Error(`Failed to get metadata for ${packageName}: HTTP ${res.statusCode}`));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`Failed to get metadata for ${packageName}: ${error.message}`));
        });
    });
}

// Helper function to check if a package exists in the registry
async function checkPackageExists(packageName, version, registry) {
    return new Promise((resolve) => {
        const url = `${registry.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`;
        const isHttps = registry.startsWith('https:');
        const client = isHttps ? https : http;

        client.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const metadata = JSON.parse(data);
                        // Check if version exists in registry
                        resolve(metadata.versions && metadata.versions[version] !== undefined);
                    } catch (error) {
                        log(`Error parsing metadata for ${packageName}: ${error.message}`, false);
                        resolve(false);
                    }
                } else {
                    resolve(false);
                }
            });
        }).on('error', (error) => {
            log(`Error checking if package exists: ${error.message}`, false);
            resolve(false);
        });
    });
}

// Helper function to get exact version from version range
function getExactVersion(metadata, versionRange) {
    return resolveVersionRange(metadata, versionRange);
}

// Helper function to resolve version ranges to specific versions
function resolveVersionRange(metadata, versionRange) {
    if (!metadata || !metadata.versions || Object.keys(metadata.versions).length === 0) {
        return null;
    }

    // For "latest" or "*", use the latest version
    if (versionRange === 'latest' || versionRange === '*') {
        return metadata['dist-tags']?.latest;
    }

    const availableVersions = Object.keys(metadata.versions)
        .sort((a, b) => compareVersions(b, a)); // Sort in descending order

    // Handle >= version ranges
    if (versionRange.startsWith('>=')) {
        const minVersion = versionRange.slice(2);
        // Find the highest version that meets the constraint
        for (const version of availableVersions) {
            if (compareVersions(version, minVersion) >= 0) {
                return version;
            }
        }
    }
    // Handle ^ ranges (compatible with)
    else if (versionRange.startsWith('^')) {
        const baseVersion = versionRange.slice(1);
        const [major] = baseVersion.split('.');

        // Find highest version with same major
        for (const version of availableVersions) {
            const [vMajor] = version.split('.');
            if (vMajor === major) {
                return version;
            }
        }
    }
    // Handle ~ ranges (approximately equivalent to)
    else if (versionRange.startsWith('~')) {
        const baseVersion = versionRange.slice(1);
        const [major, minor] = baseVersion.split('.');

        // Find highest version with same major and minor
        for (const version of availableVersions) {
            const [vMajor, vMinor] = version.split('.');
            if (vMajor === major && vMinor === minor) {
                return version;
            }
        }
    }
    // If it's an exact version that exists
    else if (metadata.versions[versionRange]) {
        return versionRange;
    }

    // Fallback to latest version if we couldn't resolve
    return metadata['dist-tags']?.latest;
}

// Helper function to compare semver versions
function compareVersions(versionA, versionB) {
    const partsA = versionA.split('.').map(p => parseInt(p, 10));
    const partsB = versionB.split('.').map(p => parseInt(p, 10));

    for (let i = 0; i < 3; i++) {
        if (partsA[i] !== partsB[i]) {
            return partsA[i] - partsB[i];
        }
    }

    return 0;
}

// Helper function to get all dependencies for a package
function getAllDependencies(metadata, version, options) {
    const { includePeerDeps, includeOptionalDeps } = options;
    const result = [];
    const versionData = metadata.versions?.[version];

    if (!versionData) {
        return result;
    }

    // Add regular dependencies
    if (versionData.dependencies) {
        for (const [name, versionRange] of Object.entries(versionData.dependencies)) {
            result.push({ name, version: versionRange });
        }
    }

    // Add peer dependencies if requested
    if (includePeerDeps && versionData.peerDependencies) {
        for (const [name, versionRange] of Object.entries(versionData.peerDependencies)) {
            result.push({ name, version: versionRange });
        }
    }

    // Add optional dependencies if requested
    if (includeOptionalDeps && versionData.optionalDependencies) {
        for (const [name, versionRange] of Object.entries(versionData.optionalDependencies)) {
            result.push({ name, version: versionRange });
        }
    }

    return result;
}

// Helper function to parse package spec into name and version
function parsePackageSpec(packageSpec) {
    // Handle scoped packages (@scope/name@version)
    if (packageSpec.startsWith('@')) {
        const scopeEnd = packageSpec.indexOf('/', 1);
        if (scopeEnd !== -1) {
            const atPos = packageSpec.indexOf('@', scopeEnd);
            if (atPos !== -1) {
                return {
                    name: packageSpec.substring(0, atPos),
                    version: packageSpec.substring(atPos + 1)
                };
            }
            return { name: packageSpec, version: 'latest' };
        }
    } else {
        // Handle regular packages (name@version)
        const parts = packageSpec.split('@');
        if (parts.length > 1) {
            return {
                name: parts[0],
                version: parts[1]
            };
        }
        return { name: packageSpec, version: 'latest' };
    }

    return { name: packageSpec, version: 'latest' };
}

// Export all helper functions
module.exports = {
    log,
    parseArgs,
    collectDependencies,
    authenticateVerdaccio,
    getPackageMetadata,
    checkPackageExists,
    getExactVersion,
    resolveVersionRange,
    compareVersions,
    getAllDependencies,
    parsePackageSpec
};
