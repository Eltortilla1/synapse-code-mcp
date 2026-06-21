# Integration Test Fixture

Fixture project used by Synapse MCP integration tests.

## Structure

- `src/app.ts` → imports `UserService`
- `src/services/user-service.ts` → imports `User`, `createUser` from models
- `src/models/user.ts` → leaf node (no local imports)
- `src/utils/format.ts` → standalone utility (not imported by app.ts)
