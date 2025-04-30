const {
    log,
    parseArgs,
    collectDependencies,
    resolveVersionRange,
    compareVersions,
    parsePackageSpec
} = require('../src/helpers');

describe('helpers', () => {
    test('log should print message in verbose mode', () => {
        console.log = jest.fn();
        log('Test message', true);
        expect(console.log).toHaveBeenCalledWith('Test message');
    });

    test('parseArgs should parse command-line arguments', () => {
        const args = ['--key1', 'value1', '--key2', '--key3', 'value3'];
        const result = parseArgs(args);
        expect(result).toEqual({ key1: 'value1', key2: true, key3: 'value3' });
    });

    test('collectDependencies should collect dependencies based on options', () => {
        const packageJson = {
            dependencies: { dep1: '1.0.0' },
            devDependencies: { devDep1: '1.0.0' },
            peerDependencies: { peerDep1: '1.0.0' },
            optionalDependencies: { optDep1: '1.0.0' }
        };
        const options = { includeDevDeps: true, includePeerDeps: true, includeOptionalDeps: true };
        const result = collectDependencies(packageJson, options);
        expect(result).toEqual([
            { name: 'dep1', version: '1.0.0' },
            { name: 'devDep1', version: '1.0.0' },
            { name: 'peerDep1', version: '1.0.0' },
            { name: 'optDep1', version: '1.0.0' }
        ]);
    });

    test('resolveVersionRange should resolve version ranges correctly', () => {
        const metadata = {
            versions: { '1.0.0': {}, '1.1.0': {}, '2.0.0': {} },
            'dist-tags': { latest: '2.0.0' }
        };
        expect(resolveVersionRange(metadata, '>=1.0.0')).toBe('2.0.0');
        expect(resolveVersionRange(metadata, '^1.0.0')).toBe('1.1.0');
        expect(resolveVersionRange(metadata, '~1.0.0')).toBe('1.0.0');
        expect(resolveVersionRange(metadata, 'latest')).toBe('2.0.0');
    });

    test('compareVersions should compare semantic versions', () => {
        expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
        expect(compareVersions('1.1.0', '1.0.1')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    test('parsePackageSpec should parse package spec into name and version', () => {
        expect(parsePackageSpec('package@1.0.0')).toEqual({ name: 'package', version: '1.0.0' });
        expect(parsePackageSpec('@scope/package@1.0.0')).toEqual({ name: '@scope/package', version: '1.0.0' });
        expect(parsePackageSpec('package')).toEqual({ name: 'package', version: 'latest' });
    });
});
