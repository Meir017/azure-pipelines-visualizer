import { describe, expect, test } from 'bun:test';
import { getVersionDescriptor } from './azure-devops.js';

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
});