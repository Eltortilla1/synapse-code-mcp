export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children?: TreeNode[];
}

export interface TreeResult {
  root: string;
  tree: TreeNode[];
  stats: {
    totalFiles: number;
    totalDirs: number;
  };
}
