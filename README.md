# coding-factory

A factory for coding factories. You register a workflow (steps plus the Cursor Cloud options needed to spawn inner agents). A later slice will host that workflow on Temporal local and execute each step by sending prompts to a Cursor Cloud agent through `@cursor/sdk`.

This slice is JSON HTTP only. There is no UI and no run-workflow API yet.

## What this slice does

- `POST /workflows` (alias `POST /register-workflow`) stores a validated workflow and returns an id.
- `GET /workflows/:id` returns that workflow.
- Storage is local SQLite behind a `WorkflowStore` port so Postgres can replace it later. HTTP handlers never import `node:sqlite`.
- Tables already exist for a future run: `workflows`, `workflow_runs` (including `cursor_agent_id`, `temporal_workflow_id`, `current_step_id`, `state`), and `workflow_run_steps`.

`CURSOR_API_KEY` is runtime env only. Register rejects `apiKey` and `agent.local`. Inner workers are always Cursor Cloud; `agent.cloud.repos` is required so `@cursor/sdk` cannot silently default to local.

## Run the server against SQLite

Requires Node 24 (see `.nvmrc`).

```bash
npm i
npm run server
```

Defaults:

- listen: `http://127.0.0.1:8787`
- sqlite: `data/factory.db`

Override with env:

```bash
PORT=8787 SQLITE_PATH=data/factory.db npm run server
```

`CURSOR_API_KEY` is not read in this slice. Do not put it in SQLite or in register JSON.

## Register a workflow with the curl scripts

The server must already be running.

```bash
chmod +x dev/curl/*.sh
./dev/curl/register-workflow.sh
```

The script prints the `wf_...` id. Fetch it:

```bash
./dev/curl/get-workflow.sh wf_YOUR_ID
```

Rejection example (apiKey + local runtime):

```bash
./dev/curl/reject-apikey.sh
```

Point the scripts at another host with `FACTORY_URL=http://127.0.0.1:8787`.

The realistic fixture is `dev/fixtures/implement-review.json`: implement → review (PASS/FIX loop) → complete. Its inner agent model is `composer-2.5` with `fast=false`, targeting `https://github.com/woweow/coding-factory` at `main`.

## Workflow JSON

TypeScript source of truth: `src/domain/types.ts`. JSON Schema: `src/domain/workflow.schema.json`.

A registered document is the create-time shape:

- `name`, optional `description`, `entry` step id
- `agent`: persistable `@cursor/sdk` `Agent.create` fields for a **cloud** worker (`model`, `mode`, `cloud.repos`, `cloud.startingRef` / `prUrl`, `autoCreatePR`, `workOnCurrentBranch`, `openAsCursorGithubApp`, `skipReviewerRequest`, `cloud.env`, `cloud.envVars`, `cloud.metadata`, `mcpServers`, subagents)
- `steps`: each step has `id`, optional `systemPrompt` / per-step `mode`, and `routes` (edge prompts + match)

Runtime handles are **not** stored on the definition:

- `workflow_runs.cursor_agent_id` — SDK `agent.agentId` (`bc-...`) threaded across steps
- `workflow_runs.temporal_workflow_id` — Temporal workflow id (next slice)
- `workflow_runs.current_step_id` / `state`
- `workflow_run_steps` — per-step prompt/output history

## Next slice (not in this branch)

Temporal local will start a run by id. Planned inner-agent flow, verified against current `@cursor/sdk` docs:

1. First step: `Agent.create({ model, cloud: { repos } })` then `send` + `wait`. Persist `agent.agentId`.
2. Later steps: `Agent.resume(agentId)` then `send` + `wait`. Runtime is detected from the `bc-` prefix.

There is no run endpoint in this slice. Do not fake one.

## Tests

```bash
npm test
npm run typecheck
```

`npm test` includes the factory register/storage tests and the existing Temporal graph PoC tests (those need Temporal test env).

Factory-only:

```bash
npm run test:factory
```

## Reference PoC (not the factory API)

The original graph walker still lives in `graph.ts` + `temporal/`. Effect samples and graph viz are in `effect-reference/`. HITL color-picker is in `temporal-reference/`.

```bash
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm run temporal
```
