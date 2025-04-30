const { collectDependencies } = require('../src/collectDependencies');

describe('collectDependencies', () => {
    const mockPackageJson = {
        dependencies: {
            "dep1": "^1.0.0",
            "dep2": "^2.0.0"
        },
        devDependencies: {
            "devDep1": "^1.0.0",
            "devDep2": "^2.0.0"
        },
        peerDependencies: {
            "peerDep1": "^1.0.0",
            "peerDep2": "^2.0.0"
        },
        optionalDependencies: {
            "optionalDep1": "^1.0.0",
            "optionalDep2": "^2.0.0"
        }
    };

    it('should collect only dependencies by default', () => {
        const options = {
            includeDevDeps: false,
            includePeerDeps: false,
            includeOptionalDeps: false,
            scope: null
        };
        const result = collectDependencies(mockPackageJson, options);
        expect(result).toEqual([
            { name: "dep1", version: "^1.0.0" },
            { name: "dep2", version: "^2.0.0" }
        ]);
    });

    it('should include devDependencies when includeDevDeps is true', () => {
        const options = {
            includeDevDeps: true,
            includePeerDeps: false,
            includeOptionalDeps: false,
            scope: null
        };
        const result = collectDependencies(mockPackageJson, options);
        expect(result).toEqual([
            { name: "dep1", version: "^1.0.0" },
            { name: "dep2", version: "^2.0.0" },
            { name: "devDep1", version: "^1.0.0" },
            { name: "devDep2", version: "^2.0.0" }
        ]);
    });

    it('should include peerDependencies when includePeerDeps is true', () => {
        const options = {
            includeDevDeps: false,
            includePeerDeps: true,
            includeOptionalDeps: false,
            scope: null
        };
        const result = collectDependencies(mockPackageJson, options);
        expect(result).toEqual([
            { name: "dep1", version: "^1.0.0" },
            { name: "dep2", version: "^2.0.0" },
            { name: "peerDep1", version: "^1.0.0" },
            { name: "peerDep2", version: "^2.0.0" }
        ]);
    });

    it('should include optionalDependencies when includeOptionalDeps is true', () => {
        const options = {
            includeDevDeps: false,
            includePeerDeps: false,
            includeOptionalDeps: true,
            scope: null
        };
        const result = collectDependencies(mockPackageJson, options);
        expect(result).toEqual([
            { name: "dep1", version: "^1.0.0" },
            { name: "dep2", version: "^2.0.0" },
            { name: "optionalDep1", version: "^1.0.0" },
            { name: "optionalDep2", version: "^2.0.0" }
        ]);
    });

    it('should filter dependencies by scope if scope is provided', () => {
        const scopedPackageJson = {
            dependencies: {
                "@scope/dep1": "^1.0.0",
                "dep2": "^2.0.0"
            }
        };
        const options = {
            includeDevDeps: false,
            includePeerDeps: false,
            includeOptionalDeps: false,
            scope: "@scope/"
        };
        const result = collectDependencies(scopedPackageJson, options);
        expect(result).toEqual([
            { name: "@scope/dep1", version: "^1.0.0" }
        ]);
    });

    it('should return an empty array if no dependencies match the criteria', () => {
        const options = {
            includeDevDeps: false,
            includePeerDeps: false,
            includeOptionalDeps: false,
            scope: "@nonexistent/"
        };
        const result = collectDependencies(mockPackageJson, options);
        expect(result).toEqual([]);
    });

    it('should handle missing dependency fields gracefully', () => {
        const incompletePackageJson = {
            dependencies: {
                "dep1": "^1.0.0"
            }
        };
        const options = {
            includeDevDeps: true,
            includePeerDeps: true,
            includeOptionalDeps: true,
            scope: null
        };
        const result = collectDependencies(incompletePackageJson, options);
        expect(result).toEqual([
            { name: "dep1", version: "^1.0.0" }
        ]);
    });
});
