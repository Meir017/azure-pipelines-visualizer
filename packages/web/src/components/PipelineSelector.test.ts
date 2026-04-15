import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import { Window } from 'happy-dom';

// Set up a minimal DOM environment before any React imports
const window = new Window();
Object.assign(globalThis, {
  document: window.document,
  window,
  HTMLElement: window.HTMLElement,
  navigator: window.navigator,
  customElements: window.customElements,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) =>
    setTimeout(cb, 0) as unknown as number,
  cancelAnimationFrame: clearTimeout,
});

// Mock fetch globally before importing modules that use it
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }),
);
globalThis.fetch = mockFetch as unknown as typeof fetch;

// Mock the api-client module to track calls
const mockFetchFileByRepoName = mock(() =>
  Promise.resolve({
    content: 'trigger: none',
    path: '/.pipelines/main.yml',
    repoId: 'repo-id',
    repoName: 'myrepo',
    branch: 'main',
  }),
);
const mockFetchPipelineYaml = mock(() =>
  Promise.resolve({
    definition: {
      id: 42,
      name: 'my-pipeline',
      path: '/.pipelines/main.yml',
      repository: {
        id: 'repo-id',
        name: 'myrepo',
        type: 'git',
        defaultBranch: 'refs/heads/main',
      },
    },
    yaml: 'trigger: none',
  }),
);

// Mock the api-client before PipelineSelector is imported
mock.module('../services/api-client.js', () => ({
  fetchFileByRepoName: mockFetchFileByRepoName,
  fetchPipelineYaml: mockFetchPipelineYaml,
  fetchTaskDocsConfig: mock(() => Promise.resolve({ customTaskDocs: {} })),
  fetchTaskSchema: mock(() => Promise.resolve({ tasks: [] })),
}));

// Dynamic import after mocks are set up
async function renderSelector(props: Record<string, unknown> = {}) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { default: PipelineSelector } = await import('./PipelineSelector.js');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  root.render(React.createElement(PipelineSelector, props));

  // Wait for effects to flush
  await new Promise((r) => setTimeout(r, 50));

  return { container, root };
}

function setLocationSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search, protocol: 'http:' },
    writable: true,
    configurable: true,
  });
}

describe('PipelineSelector', () => {
  beforeEach(() => {
    mockFetchFileByRepoName.mockClear();
    mockFetchPipelineYaml.mockClear();
    setLocationSearch('');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('renders the URL input bar', async () => {
    const { container, root } = await renderSelector();
    const inputs = container.getElementsByTagName('input');
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs[0]?.placeholder).toContain('dev.azure.com');
    root.unmount();
  });

  test('renders a Load button', async () => {
    const { container, root } = await renderSelector();
    const buttons = container.getElementsByTagName('button');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0]?.textContent).toBe('Load');
    root.unmount();
  });

  test('loads pipeline from fileUrl prop', async () => {
    const { root } = await renderSelector({
      fileUrl:
        'https://dev.azure.com/myorg/myproject/_git/myrepo?path=/.pipelines/main.yml',
    });

    expect(mockFetchFileByRepoName).toHaveBeenCalledTimes(1);
    const args = mockFetchFileByRepoName.mock.calls[0];
    expect(args[0]).toBe('myorg');
    expect(args[1]).toBe('myproject');
    expect(args[2]).toBe('myrepo');
    expect(args[3]).toBe('/.pipelines/main.yml');
    root.unmount();
  });

  test('loads pipeline from org/project/repo/path props', async () => {
    const { root } = await renderSelector({
      org: 'testorg',
      project: 'testproject',
      repo: 'testrepo',
      path: '/azure-pipelines.yml',
      branch: 'develop',
    });

    expect(mockFetchFileByRepoName).toHaveBeenCalledTimes(1);
    const args = mockFetchFileByRepoName.mock.calls[0];
    expect(args[0]).toBe('testorg');
    expect(args[1]).toBe('testproject');
    expect(args[2]).toBe('testrepo');
    expect(args[3]).toBe('/azure-pipelines.yml');
    root.unmount();
  });

  test('loads pipeline from pipelineId prop', async () => {
    const { root } = await renderSelector({
      org: 'testorg',
      project: 'testproject',
      pipelineId: 42,
    });

    expect(mockFetchPipelineYaml).toHaveBeenCalledTimes(1);
    const args = mockFetchPipelineYaml.mock.calls[0];
    expect(args[0]).toBe('testorg');
    expect(args[1]).toBe('testproject');
    expect(args[2]).toBe(42);
    root.unmount();
  });

  test('loads pipeline from URL query params when no props', async () => {
    setLocationSearch('?org=qporg&project=qpproject&pipelineId=99');

    const { root } = await renderSelector();

    expect(mockFetchPipelineYaml).toHaveBeenCalledTimes(1);
    const args = mockFetchPipelineYaml.mock.calls[0];
    expect(args[0]).toBe('qporg');
    expect(args[1]).toBe('qpproject');
    expect(args[2]).toBe(99);
    root.unmount();
  });

  test('props take precedence over query params', async () => {
    setLocationSearch('?org=qporg&project=qpproject&pipelineId=99');

    const { root } = await renderSelector({
      org: 'proporg',
      project: 'propproject',
      pipelineId: 7,
    });

    expect(mockFetchPipelineYaml).toHaveBeenCalledTimes(1);
    const args = mockFetchPipelineYaml.mock.calls[0];
    expect(args[0]).toBe('proporg');
    expect(args[1]).toBe('propproject');
    expect(args[2]).toBe(7);
    root.unmount();
  });

  test('does not auto-load when no props or query params', async () => {
    const { root } = await renderSelector();

    expect(mockFetchFileByRepoName).not.toHaveBeenCalled();
    expect(mockFetchPipelineYaml).not.toHaveBeenCalled();
    root.unmount();
  });
});
