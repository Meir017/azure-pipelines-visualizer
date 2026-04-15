import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';

// Set up a minimal DOM environment
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

// Mock fetch globally
globalThis.fetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }),
) as unknown as typeof fetch;

// Mock api-client
mock.module('./services/api-client.js', () => ({
  fetchFileByRepoName: mock(() =>
    Promise.resolve({
      content: '',
      path: '',
      repoId: '',
      repoName: '',
      branch: '',
    }),
  ),
  fetchPipelineYaml: mock(() =>
    Promise.resolve({
      definition: {
        id: 1,
        name: '',
        path: '',
        repository: { id: '', name: '', type: '', defaultBranch: '' },
      },
      yaml: '',
    }),
  ),
  fetchTaskDocsConfig: mock(() => Promise.resolve({ customTaskDocs: {} })),
  fetchTaskSchema: mock(() => Promise.resolve({ tasks: [] })),
  fetchBuildsForCommit: mock(() => Promise.resolve([])),
  fetchCommitFlowGraph: mock(() => Promise.resolve([])),
  streamCommitFlowGraph: mock(() => new AbortController()),
  fetchBuild: mock(() => Promise.resolve({})),
}));

async function getMountFn() {
  const { mount } = await import('./mount.js');
  return mount;
}

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('mount', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('returns a handle with unmount and update functions', async () => {
    const mount = await getMountFn();
    const container = createContainer();
    const handle = mount(container, {
      org: 'testorg',
      project: 'testproject',
      pipelineId: 1,
    });

    expect(handle).toBeDefined();
    expect(typeof handle.unmount).toBe('function');
    expect(typeof handle.update).toBe('function');
    handle.unmount();
  });

  test('unmount cleans up without error', async () => {
    const mount = await getMountFn();
    const container = createContainer();
    const handle = mount(container, { org: 'o', project: 'p', pipelineId: 1 });

    expect(() => handle.unmount()).not.toThrow();
  });

  test('update can change options without error', async () => {
    const mount = await getMountFn();
    const container = createContainer();
    const handle = mount(container, { org: 'o', project: 'p', pipelineId: 1 });

    expect(() => handle.update({ pipelineId: 42 })).not.toThrow();
    expect(() =>
      handle.update({ org: 'neworg', project: 'newproject' }),
    ).not.toThrow();
    handle.unmount();
  });

  test('mount with fileUrl option does not throw', async () => {
    const mount = await getMountFn();
    const container = createContainer();
    const handle = mount(container, {
      fileUrl: 'https://dev.azure.com/org/proj/_git/repo?path=/main.yml',
    });

    expect(handle).toBeDefined();
    handle.unmount();
  });

  test('mount with no options renders empty state', async () => {
    const mount = await getMountFn();
    const container = createContainer();
    const handle = mount(container);

    expect(handle).toBeDefined();
    handle.unmount();
  });

  test('can mount to different elements independently', async () => {
    const mount = await getMountFn();
    const c1 = createContainer();
    const c2 = createContainer();

    const h1 = mount(c1, { org: 'org1', project: 'p1', pipelineId: 1 });
    const h2 = mount(c2, { org: 'org2', project: 'p2', pipelineId: 2 });

    expect(() => h1.unmount()).not.toThrow();
    expect(() => h2.unmount()).not.toThrow();
  });
});
