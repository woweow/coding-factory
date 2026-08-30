#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${FACTORY_URL:-http://127.0.0.1:8787}"
WORKFLOW_ID="${1:-}"
if [[ -z "${WORKFLOW_ID}" ]]; then
  echo "usage: $0 <workflow-id>" >&2
  exit 1
fi
curl -sS -D - -o /tmp/coding-factory-run-body.json \
  -X POST "${BASE}/workflows/${WORKFLOW_ID}/runs" \
  -H "Content-Type: application/json" \
  --data-binary @"${ROOT}/dev/fixtures/run-workflow.json"
echo
python3 -m json.tool /tmp/coding-factory-run-body.json
