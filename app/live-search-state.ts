export type LiveSearchActivity = {
  focused: boolean;
  query: string;
  loading: boolean;
  resultCount: number;
};

export function isLiveSearchActive({ focused, query, loading, resultCount }: LiveSearchActivity) {
  return focused || query.trim().length > 0 || loading || resultCount > 0;
}
