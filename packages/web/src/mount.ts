import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App, { type AppProps } from './App.js';

export type MountOptions = AppProps;

export interface MountHandle {
  /** Unmount the component and clean up */
  unmount: () => void;
  /** Update the pipeline being visualized */
  update: (options: Partial<MountOptions>) => void;
}

/**
 * Mount the pipeline visualizer into a DOM element.
 * Works without React in your project — React is bundled internally.
 *
 * @example
 * ```js
 * import { mount } from '@meirblachman/azure-pipelines-visualizer-web';
 *
 * const handle = mount(document.getElementById('pipeline'), {
 *   org: 'myorg',
 *   project: 'myproject',
 *   pipelineId: 42,
 * });
 *
 * // Later: update
 * handle.update({ pipelineId: 99 });
 *
 * // Clean up
 * handle.unmount();
 * ```
 */
export function mount(
  element: HTMLElement,
  options: MountOptions = {},
): MountHandle {
  let currentOptions = { ...options };
  const root: Root = createRoot(element);

  function render(opts: MountOptions) {
    root.render(createElement(App, opts));
  }

  render(currentOptions);

  return {
    unmount: () => root.unmount(),
    update: (partial) => {
      currentOptions = { ...currentOptions, ...partial };
      render(currentOptions);
    },
  };
}
