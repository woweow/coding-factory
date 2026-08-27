#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${FACTORY_URL:-http://127.0.0.1:8787}"
curl -sS -D - -o /tmp/coding-factory-reject-apikey-body.json \
  -X POST "${BASE}/workflows" \
  -H "Content-Type: application/json" \
  --data-binary @"${ROOT}/dev/fixtures/reject-apikey.json"
echo
python3 -m json.tool /tmp/coding-factory-reject-apikey-body.json
