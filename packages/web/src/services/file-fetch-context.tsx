import { createContext, useContext } from 'react';
import type { FileByRepoNameResponse } from './api-client.js';

export type FetchFileByRepoNameFn = (
  org: string,
  project: string,
  repoName: string,
  path: string,
  branch?: string,
) => Promise<FileByRepoNameResponse>;

const FileFetchContext = createContext<FetchFileByRepoNameFn | null>(null);

export const FileFetchProvider = FileFetchContext.Provider;

export function useFileFetch(): FetchFileByRepoNameFn {
  const fn = useContext(FileFetchContext);
  if (!fn) {
    throw new Error(
      'useFileFetch must be used within a FileFetchProvider. ' +
        'Wrap your component tree with <FileFetchProvider value={...}>.',
    );
  }
  return fn;
}
