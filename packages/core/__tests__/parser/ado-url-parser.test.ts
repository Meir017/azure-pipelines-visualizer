import { describe, expect, test } from 'bun:test';
import { parseAdoUrl, buildAdoFileUrl } from '../../src/parser/ado-url-parser.js';

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

describe('buildAdoFileUrl', () => {
  test('builds URL without branch', () => {
    const url = buildAdoFileUrl({
      org: 'microsoft',
      project: 'WDATP',
      repoName: 'MyRepo',
      filePath: '/.pipelines/build.yml',
    });
    expect(url).toBe(
      'https://dev.azure.com/microsoft/WDATP/_git/MyRepo?path=%2F.pipelines%2Fbuild.yml',
    );
  });

  test('builds URL with branch', () => {
    const url = buildAdoFileUrl({
      org: 'microsoft',
      project: 'WDATP',
      repoName: 'MyRepo',
      filePath: '/build.yml',
      branch: 'main',
    });
    expect(url).toContain('version=GBmain');
    expect(url).toContain('path=%2Fbuild.yml');
  });

  test('round-trips with parseAdoUrl', () => {
    const parts = { org: 'myorg', project: 'myproj', repoName: 'myrepo', filePath: '/ci.yml', branch: 'develop' };
    const url = buildAdoFileUrl(parts);
    const parsed = parseAdoUrl(url);
    expect(parsed).toEqual(parts);
  });
});
