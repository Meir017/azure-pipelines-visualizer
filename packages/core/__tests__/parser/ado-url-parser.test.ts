import { describe, expect, test } from 'bun:test';
import {
  buildAdoFileUrl,
  parseAdoUrl,
} from '../../src/parser/ado-url-parser.js';

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
      ref: undefined,
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
      ref: 'refs/heads/main',
    });
  });

  test('parses URL with feature branch', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/build.yml&version=GBfeature/my-branch',
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBe('feature/my-branch');
    expect(result!.ref).toBe('refs/heads/feature/my-branch');
  });

  test('parses URL with tag version', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/build.yml&version=GT3.stable',
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBeUndefined();
    expect(result!.ref).toBe('refs/tags/3.stable');
  });

  test('returns null for non-ADO URLs', () => {
    expect(parseAdoUrl('https://github.com/owner/repo')).toBeNull();
  });

  test('returns null for ADO URL without path param', () => {
    expect(parseAdoUrl('https://dev.azure.com/org/proj/_git/repo')).toBeNull();
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

  test('parses URL with URL-encoded slash in branch name', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/build.yml&version=GBfeature%2Fmy-branch',
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBe('feature/my-branch');
    expect(result!.ref).toBe('refs/heads/feature/my-branch');
  });

  test('parses URL with query parameters in different order', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?version=GBmain&path=/ci.yml',
    );
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('/ci.yml');
    expect(result!.branch).toBe('main');
  });

  test('parses URL with empty version parameter', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/file.yml&version=',
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBeUndefined();
    expect(result!.ref).toBeUndefined();
  });

  test('parses URL with unknown version prefix as branch', () => {
    const result = parseAdoUrl(
      'https://dev.azure.com/org/proj/_git/repo?path=/file.yml&version=ZZunknown',
    );
    expect(result).not.toBeNull();
    // Unknown prefix: neither GB nor GT, so branch and ref remain undefined
    expect(result!.branch).toBeUndefined();
    expect(result!.ref).toBeUndefined();
  });
});

describe('buildAdoFileUrl', () => {
  test('builds URL without branch or ref', () => {
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

  test('builds URL with branch (legacy)', () => {
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

  test('builds URL with refs/heads ref', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/ci.yml',
      ref: 'refs/heads/develop',
    });
    expect(url).toContain('version=GBdevelop');
  });

  test('builds URL with refs/tags ref', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/ci.yml',
      ref: 'refs/tags/3.stable',
    });
    expect(url).toContain('version=GT3.stable');
    expect(url).not.toContain('GB');
  });

  test('ref takes precedence over branch', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/ci.yml',
      branch: 'main',
      ref: 'refs/tags/v1.0',
    });
    expect(url).toContain('version=GTv1.0');
    expect(url).not.toContain('GBmain');
  });

  test('round-trips branch URL with parseAdoUrl', () => {
    const parts = {
      org: 'myorg',
      project: 'myproj',
      repoName: 'myrepo',
      filePath: '/ci.yml',
      branch: 'develop',
      ref: 'refs/heads/develop',
    };
    const url = buildAdoFileUrl(parts);
    const parsed = parseAdoUrl(url);
    expect(parsed).toEqual(parts);
  });

  test('round-trips tag URL with parseAdoUrl', () => {
    const parts = {
      org: 'myorg',
      project: 'myproj',
      repoName: 'myrepo',
      filePath: '/ci.yml',
      ref: 'refs/tags/3.stable',
    };
    const url = buildAdoFileUrl(parts);
    const parsed = parseAdoUrl(url);
    expect(parsed!.ref).toBe('refs/tags/3.stable');
    expect(parsed!.branch).toBeUndefined();
  });

  test('builds URL with special characters in filePath', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/path with spaces/build.yml',
    });
    expect(url).toContain('path+with+spaces');
    expect(url).toContain('build.yml');
  });

  test('builds URL with ref that is neither heads nor tags', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/ci.yml',
      ref: 'abc123def',
    });
    // Non-standard ref should still use GB prefix as fallback
    expect(url).not.toContain('version=');
  });

  test('builds URL without ref or branch omits version param', () => {
    const url = buildAdoFileUrl({
      org: 'org',
      project: 'proj',
      repoName: 'repo',
      filePath: '/ci.yml',
    });
    expect(url).not.toContain('version=');
  });
});
