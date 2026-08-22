```bash
npm install
# Temporal CLI: brew install temporal
# or: curl -sSf https://temporal.download/cli.sh | sh
npm run effect
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm run temporal
npm test
npm run typecheck
npm run viz
```

http://localhost:8233
