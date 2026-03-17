import { describe, expect, test } from 'bun:test';
import {
  resolveRepoAlias,
  resolveTemplateSource,
  type ResourceRepository,
} from '../../src/model/resources.js';

const repos: ResourceRepository[] = [
  {
    repository: 'GovernedTemplates',
    type: 'git',
    name: 'OneBranch.Pipelines/GovernedTemplates',
    ref: 'refs/heads/main',
  },
  {
    repository: 'SharedTemplates',
    type: 'git',
    name: 'SharedTemplates',
    ref: 'refs/tags/v2',
  },
  {
    repository: 'ExternalRepo',
    type: 'github',
    name: 'org-name/external-repo',
    endpoint: 'my-github',
  },
];

describe('resolveRepoAlias', () => {
  test('finds matching repo by alias', () => {
    const result = resolveRepoAlias('GovernedTemplates', repos);
    expect(result?.name).toBe('OneBranch.Pipelines/GovernedTemplates');
  });

  test('returns undefined for unknown alias', () => {
    expect(resolveRepoAlias('Unknown', repos)).toBeUndefined();
  });
});

describe('resolveTemplateSource', () => {
  test('splits project/repo format', () => {
    const result = resolveTemplateSource('GovernedTemplates', repos);
    expect(result).toEqual({
      project: 'OneBranch.Pipelines',
      repoName: 'GovernedTemplates',
      ref: 'refs/heads/main',
    });
  });

  test('plain repo name has no project override', () => {
    const result = resolveTemplateSource('SharedTemplates', repos);
    expect(result).toEqual({
      repoName: 'SharedTemplates',
      ref: 'refs/tags/v2',
    });
  });

  test('handles github org/repo format', () => {
    const result = resolveTemplateSource('ExternalRepo', repos);
    expect(result).toEqual({
      project: 'org-name',
      repoName: 'external-repo',
      ref: undefined,
    });
  });

  test('returns undefined for unknown alias', () => {
    expect(resolveTemplateSource('Missing', repos)).toBeUndefined();
  });
});
