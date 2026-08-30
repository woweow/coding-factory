CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  cursor_agent_id TEXT,
  temporal_workflow_id TEXT,
  current_step_id TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  cursor_agent_id TEXT,
  prompt TEXT,
  output TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS workflow_runs_by_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_run_steps_by_run ON workflow_run_steps(run_id);
