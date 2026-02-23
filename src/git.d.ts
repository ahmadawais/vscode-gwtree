export interface Repository {
  rootUri: { fsPath: string };
  state: {
    HEAD?: { name?: string };
    onDidChange: (cb: () => void) => { dispose(): void };
  };
}

export interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: (cb: (repo: Repository) => void) => { dispose(): void };
}

export interface GitExtension {
  isActive: boolean;
  activate(): Promise<void>;
  getAPI(version: 1): GitAPI;
}
