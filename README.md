```bash
npm install
# Temporal CLI: brew install temporal
# or: curl -sSf https://temporal.download/cli.sh | sh
# Cloud agents: bash .cursor/install.sh (npm + Temporal CLI)
npm run effect
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm run temporal
npm run color-picker
npm test
npm run typecheck
npm run viz
```

http://localhost:8233

## Color picker pause / resume

`external-callback-example.ts` is the Effect machine: `colorPicker` either auto-routes to `colorLogger` (cyan) or rests, emits `NeedColor`, and continues when the host sends `ColorPicked` (red).

`temporal/color-picker-workflow.ts` is the same machine, hardcoded (not compiled from `graph.ts`):

- `pickRoute` activity is the 50/50 invoke
- `notifyNeedColor` activity is the outbound `NeedColor` message
- `NeedColor` query is the inbox the host/UI polls
- `ColorPicked` signal is `ref.send(ColorPicked)` — the workflow `condition()` waits here
- `temporal/color-picker-host.ts` is the host: if a NeedColor appears, it always signals red (no prompt)

`npm run color-picker` runs both paths inside Temporal's test environment (auto cyan, then wait + host red).
