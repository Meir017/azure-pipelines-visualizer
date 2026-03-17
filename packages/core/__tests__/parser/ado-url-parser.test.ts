import { describe, expect, test } from 'bun:test';
import { parseAdoUrl } from '../../src/parser/ado-url-parser.js';

describe('parseAdoUrl', () => {
  test('parses standard ADO file URL', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/microsoft/WDATP/_git/Wcd.Infra.ConfigurationGeneration?path=/.pipelines/onebranch.pr.gated.yml',
    );
    expect(result).toEqual({
      org: 'microsoft',
      project: 'WDATP',
      repoName: 'Wcd.Infra.ConfigurationGeneration',
      filePath: '/.pipelines/onebranch.pr.gated.yml',
      branch: undefined,
    });
  });

  test('parses URL with branch version', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/myorg/myproj/_git/myrepo?path=/azure-pipelines.yml&version=GBmain',
    );
    expect(result).toEqual({
      org: 'myorg',
      project: 'myproj',
      repoName: 'myrepo',
      filePath: '/azure-pipelines.yml',
      branch: 'main',
    });
  });

  test('parses URL with feature branch', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/build.yml&version=GBfeature/my-branch',
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBe('feature/my-branch');
  });

  test('returns null for non-ADO URLs', () => {
    expect(parseAdoUrl('https://github.com/owner/repo')).toBeNull();
  });

  test('returns null for ADO URL without path param', () => {
    expect(
      parseAdoUrl('https://dev.azure.com/org/proj/_git/repo'),
    ).toBeNull();
  });

  test('returns null for invalid URL', () => {
    expect(parseAdoUrl('not a url')).toBeNull();
  });

  test('returns null for ADO URL without _git segment', () => {
    expect(
      parseAdoUrl('https://dev.azure.com/org/proj/_build?definitionId=1'),
    ).toBeNull();
  });

  test('handles URL-encoded components', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/my%20org/my%20project/_git/my%20repo?path=/pipelines/build.yml',
    );
    expect(result).not.toBeNull();
    expect(result!.org).toBe('my org');
    expect(result!.project).toBe('my project');
    expect(result!.repoName).toBe('my repo');
  });
});
