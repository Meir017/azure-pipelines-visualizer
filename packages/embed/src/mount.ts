import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApvEmbed, type ApvEmbedProps } from './components/ApvEmbed.js';

export interface MountOptions {
  /** Azure DevOps organization name */
  org: string;
  /** Azure DevOps project name */
  project: string;
  /** Pipeline definition ID */
  pipelineId: number;
}

export interface MountHandle {
  /** Unmount the component and clean up */
  unmount: () => void;
  /** Update the pipeline being visualized */
  update: (options: Partial<MountOptions>) => void;
}

/**
 * Mount the pipeline visualizer into a DOM element.
 * Returns a handle to unmount or update the visualization.
 *
 * @example
 * ```js
 * const handle = mount(document.getElementById('pipeline'), {
 *   org: 'myorg',
 *   project: 'myproject',
 *   pipelineId: 42,
 * });
 *
 * // Later: clean up
 * handle.unmount();
 * ```
 */
export function mount(
  element: HTMLElement,
  options: MountOptions,
): MountHandle {
  let currentOptions = { ...options };
  const root: Root = createRoot(element);

  function render(opts: MountOptions) {
    root.render(
      createElement(ApvEmbed, {
        org: opts.org,
        project: opts.project,
        pipelineId: opts.pipelineId,
      } satisfies ApvEmbedProps),
    );
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
