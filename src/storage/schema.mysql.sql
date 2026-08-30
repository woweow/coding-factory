CREATE TABLE IF NOT EXISTS workflows (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(512) NOT NULL,
  definition TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  deleted_at VARCHAR(40) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id VARCHAR(64) NOT NULL,
  workflow_id VARCHAR(64) NOT NULL,
  cursor_agent_id VARCHAR(64) NULL,
  temporal_workflow_id VARCHAR(128) NULL,
  current_step_id VARCHAR(128) NULL,
  state VARCHAR(32) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_workflow_runs_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id VARCHAR(64) NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(128) NOT NULL,
  cursor_agent_id VARCHAR(64) NULL,
  prompt TEXT NULL,
  output TEXT NULL,
  status VARCHAR(32) NOT NULL,
  started_at VARCHAR(40) NULL,
  finished_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_workflow_run_steps_run FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS workflow_runs_by_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_run_steps_by_run ON workflow_run_steps(run_id);
