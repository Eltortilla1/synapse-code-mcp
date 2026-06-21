import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SynapseConfig } from './types/config.js';
import {
  GetProjectTreeSchema,
  handleGetProjectTree,
} from './tools/get-project-tree.js';
import {
  GetSemanticContextSchema,
  handleGetSemanticContext,
} from './tools/get-semantic-context.js';
import {
  SearchCodebaseSchema,
  handleSearchCodebase,
} from './tools/search-codebase.js';
import {
  GetChangedFilesSchema,
  handleGetChangedFiles,
} from './tools/get-changed-files.js';
import {
  GetProjectIndexSchema,
  handleGetProjectIndex,
} from './tools/get-project-index.js';
import { logger } from './utils/logger.js';
import { SynapseError } from './utils/errors.js';

export class SynapseServer {
  private server: McpServer;

  constructor(private readonly config: SynapseConfig) {
    this.server = new McpServer({
      name: config.serverName,
      version: config.serverVersion,
    });

    this.registerTools();
  }

  private registerTools(): void {
    this.server.tool(
      'get_project_tree',
      'Returns a structured tree view of the project repository, respecting .gitignore rules.',
      GetProjectTreeSchema.shape,
      async (input) => {
        try {
          const text = await handleGetProjectTree(input, this.config);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
      },
    );

    this.server.tool(
      'get_semantic_context',
      'Returns the content of a file along with its local dependency tree, providing rich context for understanding the code.',
      GetSemanticContextSchema.shape,
      async (input) => {
        try {
          const text = await handleGetSemanticContext(input, this.config);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
      },
    );

    this.server.tool(
      'search_codebase',
      'Searches the codebase for text or regex patterns, returning matches with file paths and line numbers.',
      SearchCodebaseSchema.shape,
      async (input) => {
        try {
          const text = await handleSearchCodebase(input, this.config);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
      },
    );

    this.server.tool(
      'get_changed_files',
      'Returns a list of files changed since a git ref (default: HEAD~1), grouped by status (added/modified/deleted). Optionally includes the full unified diff. Use this to understand what changed in a branch or commit.',
      GetChangedFilesSchema.shape,
      async (input) => {
        try {
          const text = await handleGetChangedFiles(input, this.config);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
      },
    );

    this.server.tool(
      'get_project_index',
      'Returns a compressed semantic map of the entire project: all exported functions, classes, interfaces, and types with their signatures — no implementation bodies. Ideal for getting an overview of a large codebase in a single call (~500 tokens). Call this first when exploring an unfamiliar project.',
      GetProjectIndexSchema.shape,
      async (input) => {
        try {
          const text = await handleGetProjectIndex(input, this.config);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
      },
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info({ root: this.config.root }, 'Synapse MCP server started');
  }

  async connectTransport(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }
}

function formatError(err: unknown): string {
  if (err instanceof SynapseError) {
    return `Error [${err.code}]: ${err.message}`;
  }
  if (err instanceof Error) {
    return `Error: ${err.message}`;
  }
  return 'An unknown error occurred.';
}
