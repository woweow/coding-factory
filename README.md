# coding-factory

A factory for coding factories. Register a workflow (steps plus Cursor Cloud create options). Run it by id on Temporal local. Each step is a Cursor Cloud agent via `@cursor/sdk` — never a local agent. The cloud handle (`bc-...`) is stored on the **run** (`cursorAgentId`), not on the workflow.

JSON HTTP only. No UI.

`ping.ts` exports `ping()` → `"pong"`.

## APIs

- `POST /workflows` (alias `POST /register-workflow`) — store a validated workflow, return `wf_...`
- `GET /workflows/:id`
- `POST /workflows/:id/runs` (alias `POST /run-workflow` with `{ "workflowId", "prompt?" }`) — persist a `run_...` and start Temporal. Returns the run id immediately.
- `GET /runs/:id` — current step, `cursorAgentId`, `temporalWorkflowId`, `state`, and step history
- `GET /health`

Register rejects `apiKey`, `agent.local`, `agent.mcpServers`, and `agent.agents`. `agent.cloud.repos` is required. `CURSOR_API_KEY` is env-only and is never written to SQLite.

## Local run (SQLite + Temporal + worker)

Requires Node 24 (`.nvmrc`).

```bash
npm i
temporal server start-dev --db-filename temporal.db
```

In another terminal, the factory worker (same SQLite file as the HTTP server):

```bash
SQLITE_PATH=data/factory.db FACTORY_AGENT_DRIVER=fake npm run worker
```

`FACTORY_AGENT_DRIVER=fake` uses the in-process fake Cursor SDK (no cloud agents). For real cloud agents, omit that and export `CURSOR_API_KEY`:

```bash
SQLITE_PATH=data/factory.db CURSOR_API_KEY=... npm run worker
```

HTTP server:

```bash
SQLITE_PATH=data/factory.db npm run server
```

Defaults: `http://127.0.0.1:8787`, sqlite `data/factory.db`.

## Curl

```bash
chmod +x dev/curl/*.sh
./dev/curl/register-workflow.sh
./dev/curl/run-workflow.sh wf_YOUR_ID
./dev/curl/get-run.sh run_YOUR_ID
```

Optional prompt body: `dev/fixtures/run-workflow.json`. Register fixture inner model is `composer-2.5` with `fast=false`, repo `https://github.com/woweow/coding-factory`. For a live create/resume/match check without repo edits, register `dev/fixtures/pass-json.json` and POST `dev/fixtures/run-pass-json.json`. For a tiny `ping()` on `main` (implementer → reviewer `/bugbot` → open-pr), register `dev/fixtures/ping-implement-review-pr.json` and POST `dev/fixtures/run-ping-implement-review-pr.json`.

Point scripts at another host with `FACTORY_URL=http://127.0.0.1:8787`.

## How a run executes

1. HTTP inserts `workflow_runs` (`state=running`, `temporalWorkflowId=factory-<runId>`) and starts Temporal on task queue `factory-queue`.
2. Walker starts at `entry`, follows `routes` / `match` (`always`, or `equals` via `output[key] === value`). Empty `routes` is terminal. Hop cap 32.
3. First step with no `run.cursorAgentId`: `Agent.create` with the stored slim `agent` blob (`model`, `name`, `mode`, `cloud.repos` required, plus `startingRef`, `workOnCurrentBranch`, `autoCreatePR`, `openAsCursorGithubApp`, `skipReviewerRequest`, `env`, `envVars`, `metadata`). Then `send` + `wait`. Persist `agent.agentId` on the run.
4. Later steps: `Agent.resume(run.cursorAgentId)` then `send` + `wait`.
5. Assistant text is parsed as a JSON object of strings for `equals` routing. If parse fails and a route is `always` (or there are no equals routes), the walker proceeds. If `equals` is required and parse fails, the step fails.
6. `CURSOR_API_KEY` is read only in the SDK driver.

## Workflow JSON

TypeScript: `src/domain/types.ts`. JSON Schema: `src/domain/workflow.schema.json`.

- `name`, optional `description`, `entry`
- `agent`: persistable cloud create options (no apiKey, local, mcpServers, or subagents)
- `steps`: `id`, optional `systemPrompt` / `mode`, `routes` (edge prompt + match)

Runtime on the run row: `cursorAgentId`, `temporalWorkflowId`, `currentStepId`, `state`. Step history in `workflow_run_steps`.

## Tests

```bash
npm run test:factory
npm run typecheck
```

`npm test` also runs the old Temporal graph PoC tests.

Optional real cloud e2e is skipped unless `CURSOR_API_KEY` is set.

## Reference PoC (not the factory API)

`graph.ts` + `temporal/` still walk a demo graph with a fake agent. Effect samples: `effect-reference/`. HITL color-picker: `temporal-reference/`.

```bash
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm run temporal
```
