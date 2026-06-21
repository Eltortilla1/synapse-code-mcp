export interface SymbolSignature {
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'variable';
  name: string;
  signature: string;
  exported: boolean;
}

export interface FileOutline {
  relativePath: string;
  language: string;
  symbols: SymbolSignature[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  importStatement: string;
}

export interface FileContent {
  path: string;
  relativePath: string;
  content: string;
  language: string;
  lines: number;
  outline?: FileOutline;
}

export interface SemanticContext {
  entryFile: FileContent;
  dependencies: Array<FileContent & { importedBy: string; depth: number }>;
  externalDeps: string[];
  stats: {
    totalFiles: number;
    totalLines: number;
  };
}
