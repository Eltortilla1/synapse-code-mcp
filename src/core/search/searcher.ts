import { SearchMatch, SearchResult } from '../../types/search.js';
import * as ripgrep from './ripgrep-adapter.js';
import * as native from './native-adapter.js';
import type { SearchParams } from './ripgrep-adapter.js';

export { SearchParams };

export async function search(params: SearchParams): Promise<SearchResult> {
  let matches: SearchMatch[];

  if (ripgrep.isAvailable()) {
    try {
      matches = await ripgrep.searchAsync(params);
    } catch {
      matches = await native.search(params);
    }
  } else {
    matches = await native.search(params);
  }

  matches.sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    return fileCmp !== 0 ? fileCmp : a.line - b.line;
  });

  const truncated = matches.length >= params.maxResults;

  return {
    query: params.query,
    matches: matches.slice(0, params.maxResults),
    truncated,
  };
}
