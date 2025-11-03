const fs = require('fs');
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

/**
 * Authenticate with a Verdaccio registry
 * @param {string} registry - The URL of the registry
 * @param {object} options - Options for authentication
 * (The rest of the authenticateVerdaccio function remains unchanged)
 */
async function authenticateRegistry(registry, options = {}) {
    // ... (The contents of authenticateVerdaccio remain exactly the same as before)
    const {username, password, email, verbose} = options;
    const {execSync} = require('child_process');
    const fs = require('fs');
    const path = require('path');

    // Make sure registry URL doesn't have trailing slash
    const normalizedRegistry = registry.replace(/\/\/+$/, '');

    log(`Setting npm registry to ${normalizedRegistry}`, verbose);
    execSync(`npm config set registry ${normalizedRegistry}`, {stdio: 'ignore'});

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
                execSync('npm login', {stdio: 'inherit'});

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
            return {name: packageSpec, version: 'latest'};
        }
    } else {
        // Handle regular packages (name@version)
        const parts = packageSpec.split('@');
        if (parts.length > 1) {
            // Re-join name parts if name contained '@' (should not happen with lockfile)
            const name = parts.slice(0, parts.length - 1).join('@');
            const version = parts[parts.length - 1];

            // Special case: 'name@version' vs 'name@'
            if (name === "") { // ex: @scope/pkg@1.0.0
                const atPos = packageSpec.indexOf('@', 1);
                return {
                    name: packageSpec.substring(0, atPos),
                    version: packageSpec.substring(atPos + 1)
                };
            }

            return {
                name: name,
                version: version
            };
        }
        return {name: packageSpec, version: 'latest'};
    }

    return {name: packageSpec, version: 'latest'};
}

// Export all helper functions
module.exports = {
    log,
    parseArgs,
    authenticateRegistry,
    checkPackageExists,
    parsePackageSpec
};