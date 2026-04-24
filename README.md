# ⚡ EVEZ Station — Universal AI Workstation

**Self-training AI engine with 6 monetizable APIs.** Connectable by any AI system on earth.

## 🔌 Protocols
- **OpenAPI 3.1** — `/.well-known/openapi.json`
- **ChatGPT Actions** — `/.well-known/ai-plugin.json`
- **MCP Compatible** — `/api/mcp/tools` + `/api/mcp/execute`
- **REST API** — Standard JSON endpoints

## 🧠 Training Engine
Every API call automatically generates training data. The platform trains on its own output.

```
API Calls → Training Pairs → Datasets → Fine-tune → Models → Inference → Better Output → More Training Data → ∞
```

## 🐙 Services

| Service | Description | Endpoint |
|---------|------------|----------|
| OctoKlaw | Web intelligence extraction + NLP | `/api/extract`, `/api/analyze` |
| MeshPulse | Uptime monitoring + incidents | `/api/monitors` |
| QuantumSeal | Tamper-proof hashing + verification | `/api/seal`, `/api/verify` |
| NexusLink | URL shortening + analytics | `/api/links` |
| SpectrumScan | Security header scanning | `/api/scan`, `/api/compare` |
| VortexQ | Async job queues + webhooks | `/api/jobs` |

## 🏋️ Training Endpoints

| Endpoint | Description |
|----------|------------|
| `GET /api/train/stats` | Training data statistics |
| `POST /api/train/datasets` | Create curated dataset |
| `GET /api/train/datasets/:id/export` | Export in JSONL/Alpaca/ShareGPT/OpenAI format |
| `POST /api/train/forges` | Create automated training pipeline |
| `POST /api/train/finetune` | Submit fine-tune job |
| `POST /api/train/models` | Register trained model |
| `POST /api/inference/:model_id` | Run inference |

## 🚀 Quick Start

```bash
# Get an API key
curl -X POST https://your-domain/api/keys -H "Content-Type: application/json" -d '{"name": "my-app"}'

# Extract web content
curl -X POST https://your-domain/api/extract -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" -d '{"url": "https://example.com"}'

# View training stats
curl https://your-domain/api/train/stats -H "x-api-key: YOUR_KEY"
```

## 🔧 Deploy

```bash
docker build -t evezstation .
docker run -p 3000:3000 -e SUPABASE_URL=... -e SUPABASE_SERVICE_KEY=... evezstation
```

## AI Connection

Any AI with web browsing can:
1. Visit the homepage to see services
2. Read `/.well-known/openapi.json` for full API spec
3. Use `/api/mcp/tools` for MCP-compatible tool listing
4. Generate a key via `POST /api/keys`
5. Use any service

Built by [@EvezArt](https://github.com/EvezArt) — Infinite Mesh
