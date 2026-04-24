-- EVEZ Station Training Engine Schema
-- Every API call generates training pairs. The platform trains on itself.

CREATE SCHEMA IF NOT EXISTS evezstation;

-- Master API keys (unified across all services)
CREATE TABLE evezstation.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_email TEXT,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  is_active BOOLEAN DEFAULT true,
  monthly_quota INTEGER DEFAULT 10000,
  requests_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Training data collection: every API call becomes a training pair
CREATE TABLE evezstation.training_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  service TEXT NOT NULL, -- octoklaw, meshpulse, quantumseal, etc
  endpoint TEXT NOT NULL,
  input_data JSONB NOT NULL,
  output_data JSONB NOT NULL,
  quality_score REAL DEFAULT 1.0,
  is_validated BOOLEAN DEFAULT false,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tp_service ON evezstation.training_pairs(service);
CREATE INDEX idx_tp_created ON evezstation.training_pairs(created_at DESC);
CREATE INDEX idx_tp_quality ON evezstation.training_pairs(quality_score DESC);

-- Datasets: curated collections of training pairs
CREATE TABLE evezstation.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  name TEXT NOT NULL,
  description TEXT,
  service_filter TEXT, -- null = all services
  min_quality REAL DEFAULT 0.5,
  pair_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  format TEXT DEFAULT 'jsonl' CHECK (format IN ('jsonl', 'csv', 'parquet', 'alpaca', 'sharegpt', 'openai')),
  status TEXT DEFAULT 'building' CHECK (status IN ('building', 'ready', 'exporting', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fine-tune jobs
CREATE TABLE evezstation.finetune_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  dataset_id UUID REFERENCES evezstation.datasets(id),
  base_model TEXT NOT NULL DEFAULT 'evez-base-v1',
  target_model TEXT,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'preparing', 'training', 'completed', 'failed', 'cancelled')),
  epochs INTEGER DEFAULT 3,
  learning_rate REAL DEFAULT 2e-5,
  batch_size INTEGER DEFAULT 8,
  progress REAL DEFAULT 0,
  metrics JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Model registry
CREATE TABLE evezstation.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  name TEXT NOT NULL,
  base_model TEXT NOT NULL,
  finetune_job_id UUID REFERENCES evezstation.finetune_jobs(id),
  version INTEGER DEFAULT 1,
  parameters JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  training_pairs_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deploying')),
  inference_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inference logs
CREATE TABLE evezstation.inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  model_id UUID REFERENCES evezstation.models(id),
  input_data JSONB NOT NULL,
  output_data JSONB,
  latency_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  feedback_score REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_il_model ON evezstation.inference_logs(model_id);
CREATE INDEX idx_il_created ON evezstation.inference_logs(created_at DESC);

-- Forges: automated training pipelines
CREATE TABLE evezstation.forges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES evezstation.api_keys(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'threshold' CHECK (trigger_type IN ('threshold', 'cron', 'manual')),
  trigger_config JSONB DEFAULT '{}',
  service_filter TEXT,
  min_pairs INTEGER DEFAULT 1000,
  auto_deploy BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  total_runs INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- System metrics
CREATE TABLE evezstation.system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,
  value JSONB NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sm_type ON evezstation.system_metrics(metric_type, recorded_at DESC);
