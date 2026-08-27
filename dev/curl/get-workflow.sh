#!/usr/bin/env bash
set -euo pipefail
BASE="${FACTORY_URL:-http://127.0.0.1:8787}"
ID="${1:-}"
if [[ -z "${ID}" ]]; then
  echo "usage: $0 <workflow-id>" >&2
  exit 1
fi
curl -sS -D - -o /tmp/coding-factory-get-body.json "${BASE}/workflows/${ID}"
echo
python3 -m json.tool /tmp/coding-factory-get-body.json
