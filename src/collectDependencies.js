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
        throw new Error("Formatul package-lock.json nu este suportat sau este invalid. " +
            "Vă rugăm folosiți npm v7+ pentru a genera un lockfile v2 sau v3.");
    }

    // Iterăm prin cheia 'packages' care conține o listă plată a tuturor dependențelor
    for (const [path, details] of Object.entries(lockFileContents.packages)) {

        // Sărim peste intrarea rădăcină (proiectul curent)
        if (path === "") {
            continue;
        }

        const name = details.name;
        const version = details.version;

        // Sărim peste intrările care nu au nume sau versiune (de ex. directoare simple)
        if (!name || !version) {
            continue;
        }

        // Sărim peste pachetele care sunt link-uri simbolice (de ex. 'npm link')
        if (details.link === true) {
            continue;
        }

        // Aplicăm filtrul de 'scope' dacă este specificat
        if (scope && !name.startsWith(scope)) {
            continue;
        }

        // Adăugăm în map (cheia previne duplicatele)
        const packageSpec = `${name}@${version}`;
        dependencies.set(packageSpec, {name, version});
    }

    // Returnăm un array cu valorile
    return Array.from(dependencies.values());
}

module.exports = {collectDependencies};