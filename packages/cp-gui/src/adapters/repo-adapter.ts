/**
 * RepoAdapter — repo selection (the top combobox in Blazor's NavMenu /
 * repo picker). Deliberately minimal in Stage 1: just enough shape to know
 * this exists as a separate concern from BackendAdapter/PluginAdapter.
 */

export interface RepoInfo {
  repoGuid: string;
  name: string;
}

export interface RepoAdapter {
  listRepos(): Promise<RepoInfo[]>;
}
