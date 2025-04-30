const fs = require('fs');
const { execSync } = require('child_process');
const { publishToVerdaccio } = require('../src/publishToVerdaccio');
const helpers = require('../src/helpers');

// Mock dependencies
jest.mock('fs');
jest.mock('child_process');
jest.mock('../src/helpers');

describe('publishToVerdaccio', () => {
  // Common test options
  const options = {
    verdaccioRegistry: 'http://localhost:4873',
    sourceRegistry: 'https://registry.npmjs.org',
    skipExisting: true,
    verbose: false,
    maxRetries: 3
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Default mocks
    helpers.parsePackageSpec.mockImplementation((spec) => {
      const [name, version] = spec.split('@').filter(Boolean);
      return { name: name.includes('@') ? `@${name}` : name, version };
    });

    helpers.log.mockImplementation(() => {});

    // Mock successful execSync calls
    execSync.mockImplementation((cmd) => {
      if (cmd.includes('npm pack')) {
        return 'package-1.0.0.tgz';
      }
      return '';
    });

    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync.mockImplementation(() => {});

    helpers.getPackageMetadata.mockResolvedValue({
      versions: {
        '1.0.0': {},
        '1.1.0': {},
        '2.0.0': {}
      },
      'dist-tags': {
        latest: '2.0.0'
      }
    });

    helpers.resolveVersionRange.mockReturnValue('2.0.0');

    // Add mock for checkPackageExists which is used in the implementation
    helpers.checkPackageExists.mockResolvedValue(false);
  });

  test('should publish a package with specific version', async () => {
    const packageSpec = 'test-package@1.0.0';

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('published');
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm pack test-package@1.0.0'),
        expect.any(Object)
    );
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm publish package-1.0.0.tgz'),
        expect.any(Object)
    );
    expect(fs.unlinkSync).toHaveBeenCalledWith('package-1.0.0.tgz');
  });

  test('should resolve version range before publishing', async () => {
    const packageSpec = 'test-package@^1.0.0';

    helpers.resolveVersionRange.mockReturnValue('1.1.0');

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('published');
    expect(helpers.getPackageMetadata).toHaveBeenCalledWith('test-package', options.sourceRegistry, {
      retries: 3,
      timeout: 15000
    });
    expect(helpers.resolveVersionRange).toHaveBeenCalledWith(expect.any(Object), '^1.0.0');
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm pack test-package@1.1.0'),
        expect.any(Object)
    );
  });

  test('should skip publishing if package already exists', async () => {
    const packageSpec = 'test-package@1.0.0';

    // Mock that package exists check returns true
    helpers.checkPackageExists.mockResolvedValue(true);

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('skipped');
    // Should check if package exists
    expect(helpers.checkPackageExists).toHaveBeenCalledWith(
        'test-package',
        '1.0.0',
        options.verdaccioRegistry,
        { retries: 2, timeout: 10000 }
    );
    // Should not attempt to pack or publish
    expect(execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('npm pack'),
        expect.any(Object)
    );
  });

  test('should use appropriate tag for prerelease versions', async () => {
    const packageSpec = 'test-package@1.0.0-beta.1';

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('published');
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--tag beta'),
        expect.any(Object)
    );
  });

  test('should handle scoped packages correctly', async () => {
    const packageSpec = '@scope/test-package@1.0.0';

    helpers.parsePackageSpec.mockReturnValue({ name: '@scope/test-package', version: '1.0.0' });

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('published');
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('npm pack @scope/test-package@1.0.0'),
        expect.any(Object)
    );
    expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--access=public'),
        expect.any(Object)
    );
  });

  test('should retry publishing when first attempt fails', async () => {
    const packageSpec = 'test-package@1.0.0';

    // First npm pack succeeds, first npm publish fails, second attempt succeeds
    let publishCallCount = 0;
    execSync.mockImplementation((cmd) => {
      if (cmd.includes('npm pack')) {
        return 'package-1.0.0.tgz';
      }
      if (cmd.includes('npm publish')) {
        publishCallCount++;
        if (publishCallCount === 1) {
          throw new Error('Network failure');
        }
      }
      return '';
    });

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('published');
    // Should have attempted to publish twice (first fails, second succeeds)
    expect(publishCallCount).toBe(2);
  });

  test('should skip publishing when 403 error occurs', async () => {
    const packageSpec = 'test-package@1.0.0';

    // Mock npm publish to throw a 403 error
    execSync.mockImplementation((cmd) => {
      if (cmd.includes('npm pack')) {
        return 'package-1.0.0.tgz';
      }
      if (cmd.includes('npm publish')) {
        const error = new Error('npm ERR! 403 Forbidden');
        error.status = 403;
        throw error;
      }
      return '';
    });

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('skipped');
    expect(fs.unlinkSync).toHaveBeenCalledWith('package-1.0.0.tgz');
  });

  test('should handle error when getting package metadata', async () => {
    const packageSpec = 'test-package@^1.0.0';

    helpers.getPackageMetadata.mockImplementation(() => {
      throw new Error('Registry not available');
    });

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('failed');
  });

  test('should fail gracefully when version range cannot be resolved', async () => {
    const packageSpec = 'test-package@^3.0.0';

    helpers.resolveVersionRange.mockReturnValue(null);

    const result = await publishToVerdaccio(packageSpec, options);

    expect(result).toBe('failed');
  });

});