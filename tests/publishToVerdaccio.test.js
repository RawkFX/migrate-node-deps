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
    verbose: false
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
    expect(helpers.getPackageMetadata).toHaveBeenCalledWith('test-package', options.sourceRegistry);
    expect(helpers.resolveVersionRange).toHaveBeenCalledWith(expect.any(Object), '^1.0.0');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('npm pack test-package@1.1.0'),
      expect.any(Object)
    );
  });

  test('should skip publishing if package already exists', async () => {
    const packageSpec = 'test-package@1.0.0';
    
    // Mock that package exists check returns true
    helpers.getPackageMetadata.mockImplementation((name, registry) => {
      if (registry === options.verdaccioRegistry) {
        return { versions: { '1.0.0': {} } };
      }
      return { versions: { '1.0.0': {} } };
    });
    
    const result = await publishToVerdaccio(packageSpec, options);
    
    expect(result).toBe('skipped');
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

  test('should return failed when publish fails for other reasons', async () => {
    const packageSpec = 'test-package@1.0.0';
    
    // First execSync works (npm pack), second one fails with other error
    let callCount = 0;
    execSync.mockImplementation((cmd) => {
      if (cmd.includes('npm pack')) {
        return 'package-1.0.0.tgz';
      }
      callCount++;
      if (callCount === 3) {
        throw new Error('Network failure');
      }
      return '';
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

  test('should handle error when getting package metadata', async () => {
    const packageSpec = 'test-package@^1.0.0';
    
    helpers.getPackageMetadata.mockImplementation(() => {
      throw new Error('Registry not available');
    });
    
    const result = await publishToVerdaccio(packageSpec, options);
    
    expect(result).toBe('failed');
  });
});

