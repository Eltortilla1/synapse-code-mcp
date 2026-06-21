export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  context: string;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
}
