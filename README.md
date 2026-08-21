```bash
npm install
# Temporal CLI: brew install temporal
# or: curl -sSf https://temporal.download/cli.sh | sh
temporal server start-dev --db-filename temporal.db
npm run temporal:worker
npm start
npm run temporal:start -- "Implement this feature request."
npm test
npm run typecheck
npm run viz
```

http://localhost:8233
