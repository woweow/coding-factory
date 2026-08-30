# coding-factory

A factory for coding factories. Register a workflow (steps plus Cursor Cloud create options). Run it by id on Temporal local. Each step is a Cursor Cloud agent via `@cursor/sdk` — never a local agent. The cloud handle (`bc-...`) is stored on the **run** (`cursorAgentId`), not on the workflow.

Access is split: a **business layer** (`src/business`) implements workflow CRUD and run-by-id. A thin **REST** adapter (`src/http`) keeps the curl/JSON API. A thin **RPC** adapter (`src/rpc`) is what the Next.js UI calls (server actions / in-process RPC — not HTTP-to-REST).

`ping.ts` exports `ping()` → `"pong"`.

## APIs

- `GET /workflows` — list. Query `showDeleted=true|false` (default `false`: hide soft-deleted)
- `POST /workflows` (alias `POST /register-workflow`) — store a validated workflow, return `wf_...`
- `GET /workflows/:id` — same `showDeleted` query. Default **404** if soft-deleted unless `showDeleted=true`
- `PATCH /workflows/:id` — replace definition/name (full workflow JSON, same as POST). **404** if deleted
- `DELETE /workflows/:id` — soft delete (`deleted_at`). **204** if the id exists (including already deleted); **404** if it never existed
- `GET /workflows/:id/runs` — runs for that workflow (same `showDeleted` visibility as GET workflow)
- `POST /workflows/:id/runs` (alias `POST /run-workflow` with `{ "workflowId", "prompt?" }`) — persist a `run_...` and start Temporal. Returns the run id immediately. **404** if the workflow is deleted
- `GET /runs/:id` — current step, `cursorAgentId`, `temporalWorkflowId`, `state`, and step history
- `GET /health`

`showDeleted` is the include-deleted flag. Only `true` and `false` are accepted.

Register/PATCH validate, then persist the **submitted JSON object** (one `definition` column). GET/list/PATCH return that document as-is, including explicit values such as `"mode": "agent"` and omitted optionals. Execute-time defaults are applied by the Temporal walker / `invokeAgent` / `Agent.create`/`resume`, not at write time.

Register/PATCH reject `apiKey`, `agent.local`, `agent.mcpServers`, and `agent.agents`. `agent.cloud.repos` is required. `CURSOR_API_KEY` is env-only and is never written to SQLite or MySQL.

## Storage

The `WorkflowStore` port has two adapters:

- **SQLite** (default, used by unit tests) — `SQLITE_PATH` (default `data/factory.db`)
- **MySQL** — `DATABASE_URL=mysql://user:password@host:port/database`

If `DATABASE_URL` is set, it must be a `mysql://` URL and the server/worker use MySQL. Otherwise SQLite. The Node process does not embed `mysqld`; run MySQL yourself (compose below).

On HTTP server or UI boot: migrate schema, then if the `workflows` table has **zero rows**, seed from `templates/` (`pass-json` and `ping-implement-review-pr`). Soft-deleted rows still count, so a wiped-looking list will not re-seed.

Point the UI at the same store as the REST server (`SQLITE_PATH` or `DATABASE_URL`). The UI process talks to business over RPC in-process; it does not fetch REST as its primary path.

## Local run (SQLite + Temporal + worker)

Requires Node 24 (`.nvmrc`).

```bash
npm i
temporal server start-dev --db-filename temporal.db
```

In another terminal, the factory worker (same store as the HTTP server):

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

Next.js UI (same store, RPC — not REST fetch):

```bash
SQLITE_PATH=data/factory.db npm run ui
```

Open `http://127.0.0.1:3000`. Create/list/get/patch/delete workflows as JSON, honor Show deleted, and start a run by id. The JSON box is `WorkflowJsonEditor` so a builder library can replace it later.

## MySQL (compose)

```bash
docker compose up -d
```

Wait until the `mysql` service is healthy, then point server and worker at it:

```bash
export DATABASE_URL=mysql://factory:factory@127.0.0.1:3306/factory
npm run server
```

Worker (same URL):

```bash
export DATABASE_URL=mysql://factory:factory@127.0.0.1:3306/factory
FACTORY_AGENT_DRIVER=fake npm run worker
```

Compose credentials: database/user/password `factory`, port `3306`. First boot migrates tables and seeds the two templates when the table is empty.

## Curl

```bash
chmod +x dev/curl/*.sh
./dev/curl/register-workflow.sh
curl -sS "${FACTORY_URL:-http://127.0.0.1:8787}/workflows"
curl -sS "${FACTORY_URL:-http://127.0.0.1:8787}/workflows?showDeleted=true"
./dev/curl/run-workflow.sh wf_YOUR_ID
./dev/curl/get-run.sh run_YOUR_ID
```

`GET /workflows/:id?showDeleted=true` returns a soft-deleted workflow. `DELETE /workflows/:id` soft-deletes. `PATCH /workflows/:id` sends the same JSON body shape as POST.

Optional prompt body: `dev/fixtures/run-workflow.json`. Register fixture inner model is `composer-2.5` with `fast=false`, repo `https://github.com/woweow/coding-factory`. For a live create/resume/match check without repo edits, register `dev/fixtures/pass-json.json` and POST `dev/fixtures/run-pass-json.json`. For a tiny `ping()` on `main` (implementer → reviewer `/bugbot` → open-pr), register `dev/fixtures/ping-implement-review-pr.json` and POST `dev/fixtures/run-ping-implement-review-pr.json`. Fresh MySQL/SQLite installs seed those two from `templates/`.

Point scripts at another host with `FACTORY_URL=http://127.0.0.1:8787`.

## How a run executes

1. Business inserts `workflow_runs` (`state=running`, `temporalWorkflowId=factory-<runId>`) and starts Temporal on task queue `factory-queue`. REST and RPC both call that same function.
2. Walker starts at `entry`, follows `routes` / `match` (`always`, or `equals` via `output[key] === value`). Omitted `systemPrompt` and route `prompt` default to `""`. Omitted route `match` defaults to `{ kind: "always" }`. Omitted step `mode` stays unset so agent-level `mode: "plan"` is not clobbered. Empty `routes` (or omitted routes) is terminal. Hop cap 32.
3. First step with no `run.cursorAgentId`: `Agent.create` with the stored slim `agent` blob (`model`, `name`, `mode`, `cloud.repos` required, plus `startingRef`, `workOnCurrentBranch`, `autoCreatePR`, `openAsCursorGithubApp`, `skipReviewerRequest`, `env`, `envVars`, `metadata`). Then `send` + `wait`. Persist `agent.agentId` on the run.
4. Later steps: `Agent.resume(run.cursorAgentId)` then `send` + `wait`.
5. Assistant text is parsed as a JSON object of strings for `equals` routing. If parse fails and a route is `always` (or there are no equals routes), the walker proceeds. If `equals` is required and parse fails, the step fails.
6. `CURSOR_API_KEY` is read only in the SDK driver.

## Workflow JSON

TypeScript: `src/domain/types.ts`. JSON Schema: `src/domain/workflow.schema.json`.

- `name`, optional `description`, `entry`
- `agent`: persistable cloud create options (no apiKey, local, mcpServers, or subagents)
- `steps`: `id`, optional `systemPrompt` / `mode` / `routes` (optional edge `prompt` + `match`; executor fills omitted prompt/match)

POST/PATCH persist the **submitted JSON object** after validation (not a rebuilt definition). GET/list/UI return that stored JSON as-is, including explicit `"mode": "agent"` and omitted optionals.

Stored workflow row: `deletedAt` (`null` until soft-deleted). Runtime on the run row: `cursorAgentId`, `temporalWorkflowId`, `currentStepId`, `state`. Step history in `workflow_run_steps`.

## Tests

```bash
npm run test:factory
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Factory tests use in-memory SQLite (no MySQL required). `npm test` also runs the old Temporal graph PoC tests. Playwright covers UI create/update/delete (Save is hidden on soft-deleted workflows) plus one successful `pass-json` run against Temporal local + fake agent driver (`FACTORY_AGENT_DRIVER=fake`). `scripts/e2e-stack.ts` recovers a stale `data/e2e-stack.lock` and leftover child process groups from a previous crash. Live Cursor Cloud agents are skipped unless `CURSOR_API_KEY` is set; do not put `CURSOR_*` in `cloud.envVars`.

## Reference PoC (not the factory API)

`graph.ts` + `temporal/` still walk a demo graph with a fake agent. Effect samples: `effect-reference/`. HITL color-picker: `temporal-reference/`.

```bash
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm run temporal
```
