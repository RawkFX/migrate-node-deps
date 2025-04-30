const { processPackage } = require('../src/processPackage');
const { getPackageMetadata, getExactVersion, getAllDependencies } = require('../src/helpers');

jest.mock('../src/helpers');

describe('processPackage', () => {
    let options, queue, allPackages;

    beforeEach(() => {
        options = {
            verbose: false,
            sourceRegistry: 'https://registry.npmjs.org',
            processedPackages: new Set(),
            includePeerDeps: true,
            includeOptionalDeps: false
        };
        queue = [];
        allPackages = new Set();
    });

    it('should skip processing if the package is already processed', async () => {
        options.processedPackages.add('test-package@1.0.0');
        await processPackage({ name: 'test-package', version: '1.0.0' }, queue, allPackages, options);
        expect(getPackageMetadata).not.toHaveBeenCalled();
    });

    it('should log an error if the version cannot be resolved', async () => {
        console.error = jest.fn();
        getPackageMetadata.mockResolvedValue({});
        getExactVersion.mockReturnValue(null);

        await processPackage({ name: 'test-package', version: '1.0.0' }, queue, allPackages, options);

        expect(console.error).toHaveBeenCalledWith('Could not resolve version 1.0.0 for test-package');
    });

    it('should add dependencies to the queue and allPackages', async () => {
        getPackageMetadata.mockResolvedValue({ versions: { '1.0.0': {} } });
        getExactVersion.mockReturnValue('1.0.0');
        getAllDependencies.mockReturnValue([
            { name: 'dep1', version: '1.0.0' },
            { name: 'dep2', version: '2.0.0' }
        ]);

        await processPackage({ name: 'test-package', version: '1.0.0' }, queue, allPackages, options);

        expect(queue).toEqual([
            { name: 'dep1', version: '1.0.0' },
            { name: 'dep2', version: '2.0.0' }
        ]);
        expect(allPackages).toEqual(new Set(['dep1@1.0.0', 'dep2@2.0.0']));
    });

    it('should skip dependencies that are already processed or in allPackages', async () => {
        options.processedPackages.add('dep1@1.0.0');
        allPackages.add('dep2@2.0.0');

        getPackageMetadata.mockResolvedValue({ versions: { '1.0.0': {} } });
        getExactVersion.mockReturnValue('1.0.0');
        getAllDependencies.mockReturnValue([
            { name: 'dep1', version: '1.0.0' },
            { name: 'dep2', version: '2.0.0' },
            { name: 'dep3', version: '3.0.0' }
        ]);

        await processPackage({ name: 'test-package', version: '1.0.0' }, queue, allPackages, options);

        expect(queue).toEqual([{ name: 'dep3', version: '3.0.0' }]);
        expect(allPackages).toEqual(new Set(['dep2@2.0.0', 'dep3@3.0.0']));
    });

    it('should log an error if an exception occurs during processing', async () => {
        console.error = jest.fn();
        getPackageMetadata.mockRejectedValue(new Error('Network error'));

        await processPackage({ name: 'test-package', version: '1.0.0' }, queue, allPackages, options);

        expect(console.error).toHaveBeenCalledWith('Error processing test-package@1.0.0: Network error');
    });
});
