import { describe, expect, test } from 'bun:test';
import { getVersionDescriptor, normalizeGitRef } from './azure-devops.js';

describe('normalizeGitRef', () => {
  test('preserves full refs', () => {
    expect(normalizeGitRef('refs/heads/main')).toBe('refs/heads/main');
    expect(normalizeGitRef('refs/tags/3.stable')).toBe('refs/tags/3.stable');
  });

  test('treats plain names as branches', () => {
    expect(normalizeGitRef('main')).toBe('refs/heads/main');
    expect(normalizeGitRef('feature/my-branch')).toBe('refs/heads/feature/my-branch');
  });

  test('preserves commit SHAs', () => {
    expect(normalizeGitRef('9fceb02')).toBe('9fceb02');
  });
});

describe('getVersionDescriptor', () => {
  test('normalizes branch refs for Azure DevOps item requests', () => {
    expect(getVersionDescriptor('refs/heads/main')).toEqual({
      version: 'main',
      versionType: 'branch',
    });
  });

  test('normalizes tag refs for Azure DevOps item requests', () => {
    expect(getVersionDescriptor('refs/tags/3.stable')).toEqual({
      version: '3.stable',
      versionType: 'tag',
    });
  });

  test('preserves other ref values as commit-style versions', () => {
    expect(getVersionDescriptor('9fceb02')).toEqual({
      version: '9fceb02',
      versionType: 'commit',
    });
  });

  test('treats plain branch names as branches', () => {
    expect(getVersionDescriptor('main')).toEqual({
      version: 'main',
      versionType: 'branch',
    });
  });
});