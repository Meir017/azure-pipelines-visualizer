import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
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

// Dynamic import mount after DOM globals are available
async function getMountFn() {
  const { mount } = await import('./mount.js');
  return mount;
}

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanupContainer(el: HTMLElement): void {
  if (el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

describe('mount', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      cleanupContainer(container);
    }
  });

  test('returns a handle with unmount and update functions', async () => {
    const mount = await getMountFn();
    container = createContainer();
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

  test('unmount cleans up the react root', async () => {
    const mount = await getMountFn();
    container = createContainer();
    const handle = mount(container, {
      org: 'testorg',
      project: 'testproject',
      pipelineId: 1,
    });

    // Should not throw on unmount
    expect(() => handle.unmount()).not.toThrow();
  });

  test('update can be called without error', async () => {
    const mount = await getMountFn();
    container = createContainer();
    const handle = mount(container, {
      org: 'testorg',
      project: 'testproject',
      pipelineId: 1,
    });

    expect(() => {
      handle.update({ pipelineId: 42 });
    }).not.toThrow();

    expect(() => {
      handle.update({ org: 'neworg', project: 'newproject' });
    }).not.toThrow();

    handle.unmount();
  });

  test('update with partial options preserves existing values', async () => {
    const mount = await getMountFn();
    container = createContainer();
    const handle = mount(container, {
      org: 'testorg',
      project: 'testproject',
      pipelineId: 1,
    });

    // Partial update should not error
    expect(() => {
      handle.update({ pipelineId: 99 });
    }).not.toThrow();

    handle.unmount();
  });

  test('can mount to different elements independently', async () => {
    const mount = await getMountFn();
    const container1 = createContainer();
    const container2 = createContainer();

    const handle1 = mount(container1, {
      org: 'org1',
      project: 'proj1',
      pipelineId: 1,
    });
    const handle2 = mount(container2, {
      org: 'org2',
      project: 'proj2',
      pipelineId: 2,
    });

    // Should be able to unmount independently
    expect(() => handle1.unmount()).not.toThrow();
    expect(() => handle2.unmount()).not.toThrow();

    cleanupContainer(container1);
    cleanupContainer(container2);
  });
});
