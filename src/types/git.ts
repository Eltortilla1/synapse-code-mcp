export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U';

export interface ChangedFile {
  status: ChangeStatus;
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

export interface GitDiffResult {
  baseRef: string;
  changedFiles: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
}
