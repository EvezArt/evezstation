# EVEZ STATION — UNIVERSAL AI HANDSHAKE PROTOCOL v1.0
# Any AI reading this document has everything needed to fully operate the station.
# No human intervention required after initial key generation.

## IDENTITY
- Name: EVEZ Station
- Type: Universal AI Workstation + Self-Training Engine
- Owner: EvezArt (Steven Crawford-Maggard)
- Source: https://github.com/EvezArt/evezstation

## DISCOVERY ENDPOINTS (try in order)
1. OpenAPI 3.1 Spec: GET /.well-known/openapi.json
2. ChatGPT Actions Manifest: GET /.well-known/ai-plugin.json  
3. MCP Tool Listing: GET /api/mcp/tools
4. Human-Readable Landing: GET /
5. Health Check: GET /api/health

## BOOTSTRAP SEQUENCE (execute top to bottom)

### Step 1: Generate API Key
```
POST /api/keys
Content-Type: application/json
Body: {"name": "<your-agent-name>", "email": "<optional-contact>"}
Response: {"api_key": "evz_...", "key_id": "uuid"}
```
SAVE the api_key. It is your permanent credential.

### Step 2: Verify Connection
```
GET /api/health
Headers: x-api-key: <your-key>
Expected: {"status": "operational", "services": [...]}
```

### Step 3: Use Any Service

#### OctoKlaw — Web Intelligence Extraction
```
POST /api/extract
Headers: x-api-key: <key>, Content-Type: application/json
Body: {"url": "https://example.com", "selectors": {"title": "h1", "content": "article"}}
```
```
POST /api/analyze
Body: {"text": "any text", "operations": ["sentiment", "entities", "keywords", "summarize"]}
```

#### MeshPulse — Uptime Monitoring
```
POST /api/monitors
Body: {"url": "https://your-site.com", "interval": 300, "name": "My Monitor"}
```

#### QuantumSeal — Tamper-Proof Hashing
```
POST /api/seal
Body: {"data": "any content to seal", "algorithm": "quantum-resistant"}
Response: {"seal_id": "uuid", "hash": "...", "verify_url": "..."}
```
```
POST /api/verify
Body: {"seal_id": "uuid", "data": "original content"}
Response: {"valid": true/false}
```

#### NexusLink — URL Shortening + Analytics
```
POST /api/links
Body: {"url": "https://long-url.com", "slug": "optional-custom"}
Response: {"short_url": "...", "analytics_url": "..."}
```

#### SpectrumScan — Security Header Scanning
```
POST /api/scan
Body: {"url": "https://target.com"}
Response: {"score": 85, "headers": {...}, "recommendations": [...]}
```
```
POST /api/compare
Body: {"urls": ["https://site1.com", "https://site2.com"]}
```

#### VortexQ — Async Job Queues
```
POST /api/jobs
Body: {"type": "webhook", "payload": {...}, "callback_url": "https://your-endpoint.com"}
Response: {"job_id": "uuid", "status": "queued"}
```

### Step 4: Self-Training Engine (THE CORE)

Every API call you make in Step 3 AUTOMATICALLY generates training data.
The station learns from its own usage. Here's how to leverage that:

#### View Training Stats
```
GET /api/train/stats
Headers: x-api-key: <key>
```

#### Create a Dataset from Collected Pairs
```
POST /api/train/datasets
Body: {
  "name": "my-dataset-v1",
  "service_filter": "octoklaw",  // optional: filter by service
  "min_quality": 0.7,            // minimum quality score
  "format": "openai"             // openai | alpaca | sharegpt | jsonl
}
Response: {"dataset_id": "uuid", "pair_count": 1234, "export_url": "..."}
```

#### Export Training Data
```
GET /api/train/datasets/<dataset_id>/export
Headers: x-api-key: <key>
Response: JSONL/JSON formatted training pairs ready for fine-tuning
```

#### Create a Forge (Auto-Training Pipeline)
```
POST /api/train/forges
Body: {
  "name": "auto-trainer-v1",
  "trigger_type": "threshold",    // threshold | cron | manual
  "min_pairs": 1000,              // auto-trigger at this count
  "auto_deploy": true             // auto-deploy trained model
}
```

#### Submit Fine-Tune Job
```
POST /api/train/finetune
Body: {
  "dataset_id": "<dataset-uuid>",
  "base_model": "evez-base-v1",
  "epochs": 3,
  "learning_rate": 2e-5
}
Response: {"job_id": "uuid", "status": "queued"}
```

#### Register & Use Models
```
POST /api/train/models
Body: {"name": "my-model-v1", "base_model": "evez-base-v1"}
Response: {"model_id": "uuid", "inference_url": "/api/inference/<model_id>"}
```
```
POST /api/inference/<model_id>
Body: {"input": {...}, "prompt": "optional"}
Response: {"prediction": {...}, "confidence": 0.95}
```

### Step 5: MCP Protocol (for Claude/MCP-native clients)
```
GET /api/mcp/tools
Response: {"tools": [{"name": "extract_web", ...}, {"name": "scan_security", ...}, ...]}
```
```
POST /api/mcp/execute
Body: {"tool": "extract_web", "arguments": {"url": "...", "api_key": "..."}}
Response: {"result": {...}}
```

## INFINITE LOOP PROTOCOL

Once bootstrapped, an AI agent should:
1. USE the APIs normally (generates training data automatically)
2. PERIODICALLY check /api/train/stats to monitor data accumulation
3. CREATE datasets when pair count exceeds threshold
4. SUBMIT fine-tune jobs on accumulated data
5. DEPLOY trained models for inference
6. USE inference endpoints to improve its own API calls
7. GOTO 1

This creates an infinite self-improvement loop:
```
Usage → Data → Training → Models → Better Usage → More Data → Better Training → ∞
```

## MACHINE-READABLE METADATA
```json
{
  "protocol_version": "1.0",
  "handshake_type": "explicit_universal",
  "supported_ai_clients": ["chatgpt", "claude", "perplexity", "kimi", "gemini", "copilot", "openclaw", "kiloclaw", "any"],
  "discovery_protocols": ["openapi-3.1", "chatgpt-actions", "mcp", "rest"],
  "auth_method": "api_key_header",
  "auth_header": "x-api-key",
  "key_generation": "POST /api/keys",
  "services": 6,
  "training_engine": true,
  "self_improving": true,
  "export_formats": ["openai", "alpaca", "sharegpt", "jsonl", "csv", "parquet"],
  "infinite_loop": true
}
```

## FOR OPENCLAW / KILOCLAW SPECIFICALLY

This station is designed to be consumed by autonomous AI agents:
- Zero-friction onboarding: one POST to /api/keys, then full access
- Every interaction generates training data that compounds
- Forges auto-trigger training when data accumulates
- Models auto-deploy for inference
- The station gets smarter the more any AI uses it
- No human bottleneck anywhere in the loop

Feed this entire document as context to OpenClaw. It will know exactly what to do.

---
EVEZ Station — Infinite Mesh — EvezArt
"The platform that trains on itself."
