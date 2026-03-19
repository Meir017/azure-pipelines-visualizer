/**
 * Configure @monaco-editor/react to use the locally-installed monaco-editor
 * instead of loading from a CDN. This is required for Chrome extension pages
 * where Content Security Policy blocks external scripts.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

// Import only YAML language support
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';

// Disable web workers (we only need syntax highlighting, no language services)
(globalThis as Record<string, unknown>).MonacoEnvironment = {
  getWorker: () => new Worker(
    new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
    { type: 'module' },
  ),
};

loader.config({ monaco });
