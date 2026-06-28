import { z } from 'zod';
import { SynapseConfig } from '../types/config.js';
import { buildProjectIndex, FileIndex } from '../core/analysis/project-indexer.js';
import { SymbolSignature } from '../types/context.js';

export const GetProjectIndexSchema = z.object({
  include_non_exported: z
    .boolean()
    .optional()
    .describe('Include non-exported symbols in addition to exports. Default: false.'),
  file_pattern: z
    .string()
    .optional()
    .describe('Glob to restrict which files to index (relative to project root), e.g. "src/**/*.ts".'),
  output_format: z
    .enum(['markdown', 'json'])
    .optional()
    .describe('Output format. "markdown" (default) returns a human-readable text index. "json" returns the raw symbol data as a structured JSON object.'),
});

export type GetProjectIndexInput = z.infer<typeof GetProjectIndexSchema>;

export async function handleGetProjectIndex(
  input: GetProjectIndexInput,
  config: SynapseConfig,
): Promise<string> {
  const opts: { includeNonExported?: boolean; filePattern?: string } = {
    includeNonExported: input.include_non_exported ?? false,
  };
  if (input.file_pattern !== undefined) {
    opts.filePattern = input.file_pattern;
  }

  const index = await buildProjectIndex(config.root, config, opts);

  if (index.totalFiles === 0) {
    return 'No indexable source files found in the project.';
  }

  if ((input.output_format ?? 'markdown') === 'json') {
    return JSON.stringify(index, null, 2);
  }

  const parts: string[] = [];
  const projectName = config.root.split('/').pop() ?? config.root;

  parts.push(
    `# Project Index: ${projectName} (${index.totalFiles} file${index.totalFiles === 1 ? '' : 's'}, ${index.totalSymbols} symbol${index.totalSymbols === 1 ? '' : 's'})`,
  );
  parts.push(
    '_Call `get_semantic_context` with any file path listed here to get full source + dependencies._\n',
  );

  for (const file of index.files) {
    parts.push(`## ${file.relativePath}`);
    parts.push(formatFileSymbols(file));
  }

  return parts.join('\n');
}

function formatFileSymbols(file: FileIndex): string {
  const lines: string[] = [];
  let i = 0;

  while (i < file.symbols.length) {
    const sym = file.symbols[i];
    if (!sym) { i++; continue; }

    if (sym.kind === 'class') {
      lines.push(`  ${sym.name} (class)${sym.exported ? ' [export]' : ''}`);
      i++;
      while (i < file.symbols.length && file.symbols[i]?.kind === 'method') {
        const m = file.symbols[i] as SymbolSignature;
        lines.push(`    ${m.signature}`);
        i++;
      }
    } else if (sym.kind === 'interface') {
      lines.push(`  ${sym.name} (interface)${sym.exported ? ' [export]' : ''}`);
      i++;
      while (
        i < file.symbols.length &&
        (file.symbols[i]?.kind === 'variable' || file.symbols[i]?.kind === 'method')
      ) {
        const m = file.symbols[i] as SymbolSignature;
        lines.push(`    ${m.signature}`);
        i++;
      }
    } else {
      const label = sym.kind !== 'function' ? ` (${sym.kind})` : '';
      lines.push(`  ${sym.signature}${label}${sym.exported ? ' [export]' : ''}`);
      i++;
    }
  }

  return lines.join('\n') + '\n';
}
