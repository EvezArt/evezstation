-- EVEZ Station Full Schema
-- Self-training AI platform with OpenClaw agents

CREATE SCHEMA IF NOT EXISTS evezstation;

-- Training pairs from every API call
CREATE TABLE IF NOT EXISTS evezstation.training_pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB NOT NULL DEFAULT '{}',
  quality_score NUMERIC(4,3) DEFAULT 0.5,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Curated training datasets
CREATE TABLE IF NOT EXISTS evezstation.datasets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  name TEXT NOT NULL,
  pair_count INTEGER DEFAULT 0,
  format TEXT DEFAULT 'jsonl',
  service_filter TEXT,
  min_quality NUMERIC(4,3) DEFAULT 0.5,
  status TEXT DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fine-tuning jobs
CREATE TABLE IF NOT EXISTS evezstation.finetune_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  dataset_id UUID REFERENCES evezstation.datasets(id),
  base_model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  epochs INTEGER DEFAULT 3,
  status TEXT DEFAULT 'queued',
  metrics JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registered models
CREATE TABLE IF NOT EXISTS evezstation.models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  name TEXT NOT NULL,
  base_model TEXT,
  finetune_job_id UUID REFERENCES evezstation.finetune_jobs(id),
  status TEXT DEFAULT 'active',
  inference_count BIGINT DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training forges (auto-training pipelines)
CREATE TABLE IF NOT EXISTS evezstation.forges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  name TEXT NOT NULL,
  service_filter TEXT,
  threshold INTEGER DEFAULT 1000,
  base_model TEXT DEFAULT 'llama-3.3-70b-versatile',
  auto_deploy BOOLEAN DEFAULT FALSE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OpenClaw agents
CREATE TABLE IF NOT EXISTS evezstation.claws (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'general',
  model_preset TEXT DEFAULT 'fast',
  system_prompt TEXT,
  memory JSONB DEFAULT '[]',
  tools JSONB DEFAULT '[]',
  total_interactions BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claw interaction log
CREATE TABLE IF NOT EXISTS evezstation.claw_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claw_id UUID REFERENCES evezstation.claws(id),
  api_key_id UUID NOT NULL,
  input_text TEXT,
  output_text TEXT,
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storage objects metadata
CREATE TABLE IF NOT EXISTS evezstation.storage_objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  key TEXT NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  size_bytes BIGINT DEFAULT 0,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking for billing
CREATE TABLE IF NOT EXISTS evezstation.usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status_code INTEGER,
  latency_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_training_pairs_service ON evezstation.training_pairs(service);
CREATE INDEX IF NOT EXISTS idx_training_pairs_quality ON evezstation.training_pairs(quality_score);
CREATE INDEX IF NOT EXISTS idx_claws_api_key ON evezstation.claws(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_api_key ON evezstation.usage_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON evezstation.usage_log(created_at);
