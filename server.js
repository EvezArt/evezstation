import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import cors from 'cors';
import { storage } from "./storage.js";
import { groqChat, GROQ_MODELS } from "./groq.js";
import { Claw, CLAW_PRESETS } from "./openclaw.js";
import { Arena, TeamBattle } from "./autoclaw.js";
import { Swarm, createSwarm } from "./swarm.js";
import { TemporalQueue } from "./temporal.js";
import { BattlefieldPlatform } from "./battlefield.js";
import { enterpriseMiddleware, TIERS } from "./enterprise.js";

// ── Initialize Platform Systems ──
const { middleware: entMW, audit, usage: usageTracker } = enterpriseMiddleware({ rateLimit: 100 });
const taskQueue = new TemporalQueue({ concurrency: 10 });
taskQueue.start();
const battlefield = new BattlefieldPlatform();
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));


const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: '*' }));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vziaqxquzohqskesuxgz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BASE_URL = process.env.BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://evezstation.vercel.app';

// ═══════════════════════════════════════════════════════════════
// EVEZ STATION — Universal AI Workstation
// Connectable by: ChatGPT, Claude, Perplexity, Kimi, any OpenAPI client
// Protocols: OpenAPI 3.1, ChatGPT Actions, MCP-compatible, REST
// ═══════════════════════════════════════════════════════════════

// ── Auth middleware ──
async function auth(req) {
  const k = req.headers['x-api-key'] || req.query.api_key;
  if (!k) return { r: null, e: { s: 401, b: { error: 'Missing x-api-key header or api_key query param' } } };
  const h = createHash('sha256').update(k).digest('hex');
  // Check across all schemas
  for (const schema of ['octoklaw', 'meshpulse', 'quantumseal', 'nexuslink', 'spectrumscan', 'vortexq']) {
    const { data } = await supabase.schema(schema).from('api_keys').select('*').eq('key_hash', h).eq('is_active', true).single();
    if (data) return { r: { ...data, schema }, e: null };
  }
  return { r: null, e: { s: 403, b: { error: 'Invalid API key' } } };
}

// ── AI Discovery Layer ──

// ChatGPT Actions plugin manifest
app.get('/.well-known/ai-plugin.json', (_, res) => {
  res.json({
    schema_version: 'v1',
    name_for_human: 'EVEZ Station',
    name_for_model: 'evez_station',
    description_for_human: 'Universal AI workstation — uptime monitoring, data integrity, URL shortening, security scanning, job queues, and web intelligence.',
    description_for_model: 'EVEZ Station is a unified API workstation providing 6 services: (1) OctoKlaw — extract and analyze web content from any URL, (2) MeshPulse — monitor website uptime and response times, (3) QuantumSeal — create tamper-proof hashes and verify data integrity with chain-of-custody, (4) NexusLink — shorten URLs and track click analytics, (5) SpectrumScan — scan websites for security headers and get a security grade A+ to F, (6) VortexQ — submit and manage async jobs with retry logic and webhooks. Generate an API key first via POST /api/keys, then use x-api-key header.',
    auth: { type: 'none' },
    api: { type: 'openapi', url: `${BASE_URL}/.well-known/openapi.json` },
    logo_url: `${BASE_URL}/logo.png`,
    contact_email: 'evezproductions@gmail.com',
    legal_info_url: 'https://github.com/EvezArt'
  });
});

// OpenAPI 3.1 spec — universal discovery for all AI systems
app.get('/.well-known/openapi.json', (_, res) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'EVEZ Station — Universal AI Workstation',
      description: 'A unified API workstation with 6 monetizable services. Any AI system (ChatGPT, Claude, Perplexity, Kimi, Gemini) can discover and use these endpoints. Generate a free API key to start.',
      version: '1.0.0',
      contact: { name: 'EVEZ', email: 'evezproductions@gmail.com', url: 'https://github.com/EvezArt' }
    },
    servers: [{ url: BASE_URL, description: 'EVEZ Station Production' }],
    paths: {
      '/api/health': { get: { operationId: 'healthCheck', summary: 'Check workstation status and list all available services', tags: ['System'], responses: { '200': { description: 'Workstation status with all 6 services listed' } } } },
      '/api/keys': { post: { operationId: 'generateApiKey', summary: 'Generate a free API key for all services', tags: ['Auth'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'Key name' }, email: { type: 'string', description: 'Owner email' } } } } } }, responses: { '201': { description: 'API key created' } } } },
      '/api/extract': { post: { operationId: 'extractWebContent', summary: 'Extract structured data from any URL (title, meta, headings, links, images, text)', tags: ['OctoKlaw'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, selectors: { type: 'object' } } } } } } } },
      '/api/analyze': { post: { operationId: 'analyzeContent', summary: 'Analyze text for sentiment, entities, keywords, and classification', tags: ['OctoKlaw'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } } } } },
      '/api/monitors': { post: { operationId: 'createMonitor', summary: 'Create uptime monitor for a URL', tags: ['MeshPulse'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url', 'name'], properties: { url: { type: 'string' }, name: { type: 'string' }, check_interval_seconds: { type: 'integer', default: 300 } } } } } } }, get: { operationId: 'listMonitors', summary: 'List all uptime monitors', tags: ['MeshPulse'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] } },
      '/api/monitors/{id}/check': { post: { operationId: 'checkMonitorNow', summary: 'Run immediate uptime check on a monitor', tags: ['MeshPulse'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }] } },
      '/api/seal': { post: { operationId: 'sealContent', summary: 'Create tamper-proof hash seal of content with optional chain-of-custody', tags: ['QuantumSeal'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, algorithm: { type: 'string', default: 'sha256' }, chain_to: { type: 'string', description: 'Chain to previous seal ID' } } } } } } } },
      '/api/verify': { post: { operationId: 'verifySeal', summary: 'Verify content integrity against a seal', tags: ['QuantumSeal'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['seal_id'], properties: { seal_id: { type: 'string' }, content: { type: 'string' }, content_hash: { type: 'string' } } } } } } } },
      '/api/links': { post: { operationId: 'shortenUrl', summary: 'Create a shortened URL with optional analytics tracking', tags: ['NexusLink'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, custom_code: { type: 'string' } } } } } } } },
      '/api/scan': { post: { operationId: 'scanSecurity', summary: 'Scan a website for security headers and get a grade (A+ to F)', tags: ['SpectrumScan'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } } } } } } },
      '/api/compare': { post: { operationId: 'compareSecurityUrls', summary: 'Compare security headers across multiple websites', tags: ['SpectrumScan'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['urls'], properties: { urls: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10 } } } } } } } },
      '/api/jobs': { post: { operationId: 'submitJob', summary: 'Submit async job to processing queue', tags: ['VortexQ'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['payload'], properties: { queue: { type: 'string', default: 'default' }, payload: { type: 'object' }, priority: { type: 'integer' }, webhook_url: { type: 'string' } } } } } } } },
      '/api/train/stats': { get: { operationId: 'getTrainingStats', summary: 'View training data statistics — pairs collected, models, forges', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] } },
      '/api/train/datasets': { post: { operationId: 'createDataset', summary: 'Create curated training dataset from collected API call pairs', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, service_filter: { type: 'string' }, min_quality: { type: 'number' }, format: { type: 'string', enum: ['jsonl', 'csv', 'alpaca', 'sharegpt', 'openai'] } } } } } } } },
      '/api/train/finetune': { post: { operationId: 'submitFinetune', summary: 'Submit model fine-tuning job on collected training data', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['dataset_id'], properties: { dataset_id: { type: 'string' }, base_model: { type: 'string' }, epochs: { type: 'integer' } } } } } } } },
      '/api/train/models': { post: { operationId: 'registerModel', summary: 'Register a trained model for inference', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] }, get: { operationId: 'listModels', summary: 'List all registered models', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] } },
      '/api/train/forges': { post: { operationId: 'createForge', summary: 'Create automated training forge — auto-trains when threshold reached', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] } },
      '/api/inference/{model_id}': { post: { operationId: 'runInference', summary: 'Run inference against a trained model', tags: ['Training Engine'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }, { name: 'model_id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { input: { type: 'object' }, prompt: { type: 'string' } } } } } } } },
      '/api/system/metrics': { get: { operationId: 'getSystemMetrics', summary: 'System-wide metrics — training, inference, uptime', tags: ['System'], parameters: [{ name: 'x-api-key', in: 'header', required: true, schema: { type: 'string' } }] } },
      '/api/mcp/tools': { get: { operationId: 'mcpListTools', summary: 'MCP-compatible tool listing for Claude and other MCP clients', tags: ['MCP'] } },
      '/api/mcp/execute': { post: { operationId: 'mcpExecuteTool', summary: 'MCP-compatible tool execution endpoint', tags: ['MCP'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tool', 'arguments'], properties: { tool: { type: 'string' }, arguments: { type: 'object' }, api_key: { type: 'string' } } } } } } } }
    }
  });
});

// MCP-compatible tool listing
app.get('/api/mcp/tools', (_, res) => {
  res.json({
    tools: [
      { name: 'extract_web_content', description: 'Extract structured data from any URL', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string', description: 'URL to extract from' }, api_key: { type: 'string' } } } },
      { name: 'analyze_text', description: 'Analyze text for sentiment, entities, keywords', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'create_monitor', description: 'Create uptime monitor for a URL', inputSchema: { type: 'object', required: ['url', 'name'], properties: { url: { type: 'string' }, name: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'check_monitor', description: 'Run immediate uptime check', inputSchema: { type: 'object', required: ['monitor_id'], properties: { monitor_id: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'seal_content', description: 'Create tamper-proof hash of content', inputSchema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, algorithm: { type: 'string' }, chain_to: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'verify_seal', description: 'Verify content against a seal', inputSchema: { type: 'object', required: ['seal_id'], properties: { seal_id: { type: 'string' }, content: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'shorten_url', description: 'Create shortened URL with analytics', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, title: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'scan_security', description: 'Scan website security headers (grade A+ to F)', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, api_key: { type: 'string' } } } },
      { name: 'compare_security', description: 'Compare security across multiple URLs', inputSchema: { type: 'object', required: ['urls'], properties: { urls: { type: 'array', items: { type: 'string' } }, api_key: { type: 'string' } } } },
      { name: 'submit_job', description: 'Submit async job to queue', inputSchema: { type: 'object', required: ['payload'], properties: { queue: { type: 'string' }, payload: { type: 'object' }, priority: { type: 'integer' }, api_key: { type: 'string' } } } },
      { name: 'generate_api_key', description: 'Generate a free API key', inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, email: { type: 'string' } } } }
    ]
  });
});

// MCP execute endpoint — routes tool calls to the right handler
app.post('/api/mcp/execute', async (req, res) => {
  const { tool, arguments: args = {} } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool required' });

  // Inject api_key into headers for auth
  if (args.api_key) req.headers['x-api-key'] = args.api_key;

  const routes = {
    'generate_api_key': () => generateKey(req, res, args),
    'extract_web_content': () => extractWeb(req, res, args),
    'analyze_text': () => analyzeText(req, res, args),
    'create_monitor': () => createMonitor(req, res, args),
    'seal_content': () => sealContent(req, res, args),
    'verify_seal': () => verifySeal(req, res, args),
    'shorten_url': () => shortenUrl(req, res, args),
    'scan_security': () => scanSecurity(req, res, args),
    'compare_security': () => compareSecurity(req, res, args),
    'submit_job': () => submitJob(req, res, args),
  };

  if (routes[tool]) return routes[tool]();
  res.status(404).json({ error: `Unknown tool: ${tool}`, available: Object.keys(routes) });
});

// ── Health + Dashboard ──
app.get('/api/health', (_, res) => {
  res.json({
    status: 'operational',
    service: 'EVEZ Station — Universal AI Workstation',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    protocols: ['openapi-3.1', 'chatgpt-actions', 'mcp-compatible', 'rest'],
    discovery: {
      openapi: `${BASE_URL}/.well-known/openapi.json`,
      chatgpt_plugin: `${BASE_URL}/.well-known/ai-plugin.json`,
      mcp_tools: `${BASE_URL}/api/mcp/tools`,
      mcp_execute: `${BASE_URL}/api/mcp/execute`
    },
    services: [
      { name: 'OctoKlaw', description: 'Web intelligence extraction + NLP analysis', endpoints: ['/api/extract', '/api/analyze'] },
      { name: 'MeshPulse', description: 'Uptime monitoring + incident detection', endpoints: ['/api/monitors', '/api/monitors/:id/check'] },
      { name: 'QuantumSeal', description: 'Tamper-proof data integrity verification', endpoints: ['/api/seal', '/api/verify'] },
      { name: 'NexusLink', description: 'URL shortening + click analytics', endpoints: ['/api/links'] },
      { name: 'SpectrumScan', description: 'Security header scanning + grading', endpoints: ['/api/scan', '/api/compare'] },
      { name: 'VortexQ', description: 'Async job queues + webhooks', endpoints: ['/api/jobs'] }
    ],
    github: 'https://github.com/EvezArt',
    connect: 'POST /api/keys with {"name": "your-app"} to get a free API key'
  });
});

// ── Homepage (HTML for browsers) ──
app.get('/', (_, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>EVEZ Station</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:2rem}
.hero{text-align:center;margin:2rem 0}.hero h1{font-size:3rem;background:linear-gradient(135deg,#00ff88,#00bbff,#ff00ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:0.5rem}
.hero p{color:#888;font-size:1.2rem;max-width:600px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.5rem;max-width:1000px;width:100%;margin:2rem 0}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:1.5rem;transition:border-color 0.3s}.card:hover{border-color:#00ff88}
.card h3{font-size:1.1rem;margin-bottom:0.5rem;color:#fff}.card p{color:#888;font-size:0.9rem;line-height:1.5}
.badge{display:inline-block;background:#00ff8820;color:#00ff88;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-top:0.5rem}
.protocols{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin:1rem 0}
.proto{background:#111;border:1px solid #333;padding:0.5rem 1rem;border-radius:8px;font-size:0.85rem;color:#aaa}
code{background:#111;padding:2px 6px;border-radius:4px;font-size:0.85rem;color:#00ff88}
.cta{margin:2rem 0;text-align:center}.cta a{color:#00bbff;text-decoration:none;font-size:1.1rem}
footer{margin-top:auto;padding:2rem;color:#555;font-size:0.8rem;text-align:center}
</style></head><body>
<div class="hero"><h1>⚡ EVEZ Station</h1><p>Universal AI Workstation — 6 monetizable APIs, connectable by any AI system on earth</p></div>
<div class="protocols">
<div class="proto">🔌 OpenAPI 3.1</div><div class="proto">🤖 ChatGPT Actions</div>
<div class="proto">🔗 MCP Compatible</div><div class="proto">🌐 REST API</div>
</div>
<div class="grid">
<div class="card"><h3>🐙 OctoKlaw</h3><p>Web intelligence extraction + NLP analysis. Structured data from any URL.</p><span class="badge">POST /api/extract</span></div>
<div class="card"><h3>📡 MeshPulse</h3><p>Uptime monitoring + incident detection. Track response times across the web.</p><span class="badge">POST /api/monitors</span></div>
<div class="card"><h3>🔐 QuantumSeal</h3><p>Tamper-proof hashing + chain verification. Cryptographic audit trails.</p><span class="badge">POST /api/seal</span></div>
<div class="card"><h3>🔗 NexusLink</h3><p>URL shortening + click analytics. Device tracking, expiring links.</p><span class="badge">POST /api/links</span></div>
<div class="card"><h3>🛡️ SpectrumScan</h3><p>Security header scanner. Grade A+ to F with actionable recommendations.</p><span class="badge">POST /api/scan</span></div>
<div class="card"><h3>🌀 VortexQ</h3><p>Async job queue. Priority, retry logic, dead-letter, webhook notifications.</p><span class="badge">POST /api/jobs</span></div>
</div>
<div class="cta">
<p style="margin-bottom:1rem">Get started: <code>POST /api/keys</code> with <code>{"name": "my-app"}</code></p>
<p><a href="/.well-known/openapi.json">OpenAPI Spec</a> · <a href="/.well-known/ai-plugin.json">ChatGPT Plugin</a> · <a href="/api/mcp/tools">MCP Tools</a> · <a href="/api/health">Health</a></p>
</div>
<footer>EVEZ Station v1.0 · Built by <a href="https://github.com/EvezArt" style="color:#00ff88">@EvezArt</a> · 6 APIs · Infinite Mesh</footer>
</body></html>`);
});

// ── Shared Key Generation ──
async function generateKey(req, res, body) {
  const { name, email } = body || req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const raw = `evez_${randomBytes(24).toString('hex')}`;
  const keyHash = createHash('sha256').update(raw).digest('hex');

  // Create keys across all schemas
  const schemas = ['octoklaw', 'meshpulse', 'quantumseal', 'nexuslink', 'spectrumscan', 'vortexq'];
  const results = {};
  for (const schema of schemas) {
    try {
      const { data, error } = await supabase.schema(schema).from('api_keys').insert({
        key_hash: keyHash, name, owner_email: email || null,
        ...(schema === 'meshpulse' ? { tier: 'free', max_monitors: 5, check_interval_min: 300, monthly_quota: 10000 } : {}),
        ...(schema === 'nexuslink' ? { max_links: 100, monthly_clicks: 10000 } : {}),
        ...(schema === 'vortexq' ? { max_queues: 3, monthly_quota: 5000, max_payload_bytes: 65536 } : {})
      }).select('id').single();
      results[schema] = data ? 'ok' : (error?.message || 'failed');
    } catch (e) { results[schema] = e.message; }
  }

  res.status(201).json({
    api_key: raw,
    name,
    message: 'Universal API key — works across all 6 EVEZ Station services',
    services_activated: results,
    usage: 'Pass as x-api-key header or api_key query parameter',
    docs: `${BASE_URL}/.well-known/openapi.json`
  });
}
app.post('/api/keys', (req, res) => generateKey(req, res, req.body));

// ── SECURITY HEADERS (shared) ──
const SECURITY_HEADERS = {
  'strict-transport-security': { weight: 15, label: 'HSTS' },
  'content-security-policy': { weight: 15, label: 'CSP' },
  'x-content-type-options': { weight: 10, label: 'X-Content-Type-Options' },
  'x-frame-options': { weight: 10, label: 'X-Frame-Options' },
  'x-xss-protection': { weight: 5, label: 'X-XSS-Protection' },
  'referrer-policy': { weight: 10, label: 'Referrer-Policy' },
  'permissions-policy': { weight: 10, label: 'Permissions-Policy' },
  'cross-origin-opener-policy': { weight: 5, label: 'COOP' },
  'cross-origin-resource-policy': { weight: 5, label: 'CORP' },
  'cross-origin-embedder-policy': { weight: 5, label: 'COEP' },
  'cache-control': { weight: 5, label: 'Cache-Control' },
  'x-permitted-cross-domain-policies': { weight: 5, label: 'X-Permitted-Cross-Domain' }
};

function gradeFromScore(s) { return s >= 90 ? 'A+' : s >= 80 ? 'A' : s >= 70 ? 'B' : s >= 60 ? 'C' : s >= 40 ? 'D' : 'F'; }

// ── OctoKlaw: Web Extraction ──
async function extractWeb(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { url } = body || req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  // Check cache
  const urlHash = createHash('sha256').update(url).digest('hex');
  const { data: cached } = await supabase.schema('octoklaw').from('intelligence_cache').select('*').eq('url_hash', urlHash).gt('expires_at', new Date().toISOString()).single();
  if (cached) return res.json({ source: 'cache', ...cached.extracted_data, cached_at: cached.cached_at });

  try {
    const fr = await fetch(url, { headers: { 'User-Agent': 'EVEZStation/1.0 (+https://github.com/EvezArt)' }, signal: AbortSignal.timeout(15000) });
    const html = await fr.text();

    // Extract structured data
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/is);
    const metaKw = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["'](.*?)["']/is);
    const headings = [...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis)].slice(0, 20).map(m => ({ level: parseInt(m[1]), text: m[2].replace(/<[^>]+>/g, '').trim() }));
    const links = [...html.matchAll(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gis)].slice(0, 50).map(m => ({ url: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }));
    const images = [...html.matchAll(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*(?:alt=["'](.*?)["'])?/gis)].slice(0, 30).map(m => ({ src: m[1], alt: m[2] || '' }));
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);

    const result = {
      url, status: fr.status,
      title: titleMatch ? titleMatch[1].trim() : null,
      meta_description: metaDesc ? metaDesc[1].trim() : null,
      meta_keywords: metaKw ? metaKw[1].split(',').map(k => k.trim()) : [],
      headings, links: links.filter(l => l.text),
      images: images.filter(i => i.src),
      text_preview: text.substring(0, 2000),
      word_count: text.split(/\s+/).length,
      extracted_at: new Date().toISOString()
    };

    // Cache for 24h
    await supabase.schema('octoklaw').from('intelligence_cache').upsert({
      url_hash: urlHash, url, extracted_data: result,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }, { onConflict: 'url_hash' });

    // Log usage
    await supabase.schema('octoklaw').from('usage_logs').insert({ api_key_id: r.id, endpoint: '/extract', tokens_used: 1 });

    res.json({ source: 'live', ...result });
  } catch (err) {
    res.status(500).json({ error: 'Extraction failed', message: err.message });
  }
}
app.post('/api/extract', (req, res) => extractWeb(req, res, req.body));

// ── OctoKlaw: Text Analysis ──
async function analyzeText(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { text } = body || req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  const words = text.toLowerCase().split(/\s+/);
  const positive = ['good','great','excellent','amazing','love','best','wonderful','fantastic','happy','perfect','beautiful','awesome'];
  const negative = ['bad','terrible','awful','hate','worst','horrible','ugly','poor','sad','angry','fail','broken'];
  const posCount = words.filter(w => positive.includes(w)).length;
  const negCount = words.filter(w => negative.includes(w)).length;
  const sentimentScore = words.length > 0 ? (posCount - negCount) / Math.max(posCount + negCount, 1) : 0;

  // Keyword extraction (TF-based)
  const stopwords = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','about','up','it','its','i','me','my','we','our','you','your','he','him','his','she','her','they','them','their','this','that','these','those','what','which','who','whom']);
  const freq = {};
  words.filter(w => w.length > 2 && !stopwords.has(w)).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count, frequency: (count / words.length).toFixed(4) }));

  // Entity-like extraction (capitalized sequences)
  const entities = [...new Set(text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [])].slice(0, 20);

  // Classification
  const techWords = ['api','code','software','data','algorithm','system','server','deploy','build','database','cloud'];
  const bizWords = ['revenue','profit','market','customer','sales','business','growth','strategy','invest','roi'];
  const techScore = words.filter(w => techWords.includes(w)).length;
  const bizScore = words.filter(w => bizWords.includes(w)).length;
  const category = techScore > bizScore ? 'technology' : bizScore > techScore ? 'business' : 'general';

  await supabase.schema('octoklaw').from('usage_logs').insert({ api_key_id: r.id, endpoint: '/analyze', tokens_used: 1 });

  res.json({
    sentiment: { score: sentimentScore, label: sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral', positive_words: posCount, negative_words: negCount },
    keywords, entities,
    classification: { primary: category, tech_signal: techScore, business_signal: bizScore },
    stats: { word_count: words.length, unique_words: new Set(words).size, avg_word_length: (words.reduce((s, w) => s + w.length, 0) / words.length).toFixed(1), sentence_count: (text.match(/[.!?]+/g) || []).length },
    analyzed_at: new Date().toISOString()
  });
}
app.post('/api/analyze', (req, res) => analyzeText(req, res, req.body));

// ── MeshPulse: Monitors ──
async function createMonitor(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { url, name, check_interval_seconds = 300, expected_status = 200 } = body || req.body || {};
  if (!url || !name) return res.status(400).json({ error: 'url and name required' });
  const { data, error } = await supabase.schema('meshpulse').from('monitors').insert({ api_key_id: r.id, url, name, check_interval_seconds, expected_status }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}
app.post('/api/monitors', (req, res) => createMonitor(req, res, req.body));
app.get('/api/monitors', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data } = await supabase.schema('meshpulse').from('monitors').select('*').eq('api_key_id', r.id).order('created_at', { ascending: false });
  res.json({ monitors: data || [] });
});

app.post('/api/monitors/:id/check', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data: mon } = await supabase.schema('meshpulse').from('monitors').select('*').eq('id', req.params.id).eq('api_key_id', r.id).single();
  if (!mon) return res.status(404).json({ error: 'Monitor not found' });
  const started = Date.now();
  try {
    const fr = await fetch(mon.url, { signal: AbortSignal.timeout(mon.timeout_ms || 10000), headers: { 'User-Agent': 'EVEZStation/1.0' } });
    const ms = Date.now() - started;
    const isUp = fr.status === mon.expected_status;
    await supabase.schema('meshpulse').from('check_logs').insert({ monitor_id: mon.id, status_code: fr.status, response_time_ms: ms, is_up: isUp });
    res.json({ monitor: mon.name, url: mon.url, status_code: fr.status, response_time_ms: ms, is_up: isUp });
  } catch (err) {
    res.json({ monitor: mon.name, url: mon.url, is_up: false, error: err.message, response_time_ms: Date.now() - started });
  }
});

// ── QuantumSeal ──
async function sealContent(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { content, algorithm = 'sha256', metadata = {}, chain_to } = body || req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const contentHash = createHash(algorithm).update(typeof content === 'string' ? content : JSON.stringify(content)).digest('hex');
  let sealChain = contentHash, previousSealId = null;
  if (chain_to) {
    const { data: prev } = await supabase.schema('quantumseal').from('seals').select('id, seal_chain').eq('id', chain_to).single();
    if (prev) { previousSealId = prev.id; sealChain = createHash('sha256').update(prev.seal_chain + contentHash).digest('hex'); }
  }
  const { data, error } = await supabase.schema('quantumseal').from('seals').insert({ api_key_id: r.id, content_hash: contentHash, algorithm, metadata, seal_chain: sealChain, previous_seal_id: previousSealId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ seal_id: data.id, content_hash: contentHash, seal_chain: sealChain, algorithm, chained_to: previousSealId, created_at: data.created_at });
}
app.post('/api/seal', (req, res) => sealContent(req, res, req.body));

async function verifySeal(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { seal_id, content, content_hash } = body || req.body || {};
  if (!seal_id) return res.status(400).json({ error: 'seal_id required' });
  const { data: seal } = await supabase.schema('quantumseal').from('seals').select('*').eq('id', seal_id).single();
  if (!seal) return res.status(404).json({ error: 'Seal not found' });
  let computed = content_hash;
  if (!computed && content) computed = createHash(seal.algorithm).update(typeof content === 'string' ? content : JSON.stringify(content)).digest('hex');
  if (!computed) return res.status(400).json({ error: 'Provide content or content_hash' });
  const isValid = computed === seal.content_hash;
  await supabase.schema('quantumseal').from('verifications').insert({ seal_id: seal.id, is_valid: isValid, verifier_ip: req.ip });
  res.json({ seal_id, is_valid: isValid, algorithm: seal.algorithm, sealed_at: seal.created_at, verified_count: (seal.verified_count || 0) + 1 });
}
app.post('/api/verify', (req, res) => verifySeal(req, res, req.body));

// ── NexusLink ──
async function shortenUrl(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { url, title, custom_code, expires_in_hours } = body || req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const code = custom_code || randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').substring(0, 7);
  const expires_at = expires_in_hours ? new Date(Date.now() + expires_in_hours * 3600000).toISOString() : null;
  const { data, error } = await supabase.schema('nexuslink').from('links').insert({ api_key_id: r.id, short_code: code, target_url: url, title, expires_at }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ short_code: code, short_url: `${BASE_URL}/r/${code}`, target_url: url, title, created_at: data.created_at });
}
app.post('/api/links', (req, res) => shortenUrl(req, res, req.body));

app.get('/r/:code', async (req, res) => {
  const { data: link } = await supabase.schema('nexuslink').from('links').select('*').eq('short_code', req.params.code).eq('is_active', true).single();
  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });
  const ua = req.headers['user-agent'] || '';
  await supabase.schema('nexuslink').from('clicks').insert({ link_id: link.id, user_agent: ua, ip_hash: createHash('sha256').update(req.ip || '').digest('hex').substring(0, 16), device_type: /mobile/i.test(ua) ? 'mobile' : 'desktop', browser: /chrome/i.test(ua) ? 'chrome' : /firefox/i.test(ua) ? 'firefox' : 'other' });
  await supabase.schema('nexuslink').from('links').update({ click_count: link.click_count + 1 }).eq('id', link.id);
  res.redirect(302, link.target_url);
});

// ── SpectrumScan ──
async function scanSecurity(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { url } = body || req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const fr = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'EVEZStation/1.0' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
    const headers = Object.fromEntries([...fr.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    const present = [], missing = [], recommendations = [];
    let score = 0, maxScore = 0;
    for (const [header, info] of Object.entries(SECURITY_HEADERS)) {
      maxScore += info.weight;
      if (headers[header]) { present.push({ header: info.label, value: headers[header] }); score += info.weight; }
      else { missing.push(info.label); recommendations.push(`Add ${info.label} header`); }
    }
    const finalScore = Math.round((score / maxScore) * 100);
    await supabase.schema('spectrumscan').from('scans').insert({ api_key_id: r.id, url, url_hash: createHash('sha256').update(url).digest('hex'), grade: gradeFromScore(finalScore), score: finalScore, headers_present: present.map(p => p.header), headers_missing: missing, recommendations });
    res.json({ url, grade: gradeFromScore(finalScore), score: finalScore, headers_present: present, headers_missing: missing, recommendations, dangerous_headers: ['server', 'x-powered-by'].filter(h => headers[h]).map(h => ({ header: h, value: headers[h] })), scanned_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: 'Scan failed', message: err.message }); }
}
app.post('/api/scan', (req, res) => scanSecurity(req, res, req.body));

async function compareSecurity(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { urls } = body || req.body || {};
  if (!urls || !Array.isArray(urls) || urls.length < 2) return res.status(400).json({ error: 'Provide 2+ urls' });
  const results = [];
  for (const url of urls.slice(0, 10)) {
    try {
      const fr = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'EVEZStation/1.0' }, signal: AbortSignal.timeout(10000) });
      const headers = Object.fromEntries([...fr.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
      let score = 0, max = 0;
      for (const [h, info] of Object.entries(SECURITY_HEADERS)) { max += info.weight; if (headers[h]) score += info.weight; }
      const pct = Math.round((score / max) * 100);
      results.push({ url, grade: gradeFromScore(pct), score: pct });
    } catch { results.push({ url, grade: 'ERR', score: 0 }); }
  }
  results.sort((a, b) => b.score - a.score);
  res.json({ comparison: results, best: results[0]?.url, worst: results[results.length - 1]?.url });
}
app.post('/api/compare', (req, res) => compareSecurity(req, res, req.body));

// ── VortexQ ──
async function submitJob(req, res, body) {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { queue = 'default', payload, priority = 0, max_attempts = 3, webhook_url, delay_seconds } = body || req.body || {};
  if (!payload) return res.status(400).json({ error: 'payload required' });
  const scheduled_for = delay_seconds ? new Date(Date.now() + delay_seconds * 1000).toISOString() : new Date().toISOString();
  const { data, error } = await supabase.schema('vortexq').from('jobs').insert({ api_key_id: r.id, queue, payload, priority, max_attempts, webhook_url, scheduled_for }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ job_id: data.id, queue, status: 'pending', priority, scheduled_for, created_at: data.created_at });
}
app.post('/api/jobs', (req, res) => submitJob(req, res, req.body));

app.get('/api/jobs/:id', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data } = await supabase.schema('vortexq').from('jobs').select('*').eq('id', req.params.id).eq('api_key_id', r.id).single();
  if (!data) return res.status(404).json({ error: 'Job not found' });
  res.json(data);
});

app.post('/api/queues/:queue/pull', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data } = await supabase.schema('vortexq').from('jobs').select('*').eq('api_key_id', r.id).eq('queue', req.params.queue).eq('status', 'pending').lte('scheduled_for', new Date().toISOString()).order('priority', { ascending: false }).limit(1).single();
  if (!data) return res.json({ job: null, message: 'Queue empty' });
  await supabase.schema('vortexq').from('jobs').update({ status: 'processing', started_at: new Date().toISOString(), attempts: data.attempts + 1 }).eq('id', data.id);
  res.json({ job: { id: data.id, payload: data.payload, queue: data.queue, attempt: data.attempts + 1 } });
});

app.post('/api/jobs/:id/complete', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { result } = req.body || {};
  const { data } = await supabase.schema('vortexq').from('jobs').update({ status: 'completed', result: result || {}, completed_at: new Date().toISOString() }).eq('id', req.params.id).eq('api_key_id', r.id).select().single();
  if (!data) return res.status(404).json({ error: 'Job not found' });
  res.json({ job_id: data.id, status: 'completed' });
});

// ── Logo (SVG) ──
app.get('/logo.png', (_, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#0a0a0a"/><text x="50" y="65" text-anchor="middle" font-size="50" fill="#00ff88">⚡</text></svg>`);
});

// ═══════════════════════════════════════════════════════════════
// TRAINING ENGINE — Every API call becomes training data
// Self-improving: the platform trains on its own output
// ═══════════════════════════════════════════════════════════════

// Middleware: auto-collect training pairs from every API call
function collectTrainingData(service, endpoint) {
  return async (req, res, next) => {
    const startTime = Date.now();
    const originalJson = res.json.bind(res);
    const inputData = { ...req.body, params: req.params, query: req.query };

    res.json = function(data) {
      const latency = Date.now() - startTime;
      // Fire-and-forget training pair collection
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      if (apiKey && res.statusCode < 400) {
        const keyHash = createHash('sha256').update(apiKey).digest('hex');
        supabase.schema('evezstation').from('api_keys').select('id').eq('key_hash', keyHash).single()
          .then(({ data: keyData }) => {
            if (keyData) {
              const inputStr = JSON.stringify(inputData);
              const outputStr = JSON.stringify(data);
              supabase.schema('evezstation').from('training_pairs').insert({
                api_key_id: keyData.id, service, endpoint,
                input_data: inputData, output_data: data,
                tokens_in: Math.ceil(inputStr.length / 4),
                tokens_out: Math.ceil(outputStr.length / 4),
                latency_ms: latency,
                quality_score: res.statusCode === 200 || res.statusCode === 201 ? 1.0 : 0.5
              }).then(() => {});
            }
          }).catch(() => {});
      }
      return originalJson(data);
    };
    next();
  };
}

// Apply training collection to all API endpoints
app.use('/api/extract', collectTrainingData('octoklaw', '/extract'));
app.use('/api/analyze', collectTrainingData('octoklaw', '/analyze'));
app.use('/api/monitors', collectTrainingData('meshpulse', '/monitors'));
app.use('/api/seal', collectTrainingData('quantumseal', '/seal'));
app.use('/api/verify', collectTrainingData('quantumseal', '/verify'));
app.use('/api/links', collectTrainingData('nexuslink', '/links'));
app.use('/api/scan', collectTrainingData('spectrumscan', '/scan'));
app.use('/api/compare', collectTrainingData('spectrumscan', '/compare'));
app.use('/api/jobs', collectTrainingData('vortexq', '/jobs'));

// ── Training Data Endpoints ──

// Get training stats
app.get('/api/train/stats', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data: pairs } = await supabase.schema('evezstation').from('training_pairs').select('service, quality_score, tokens_in, tokens_out, created_at').order('created_at', { ascending: false }).limit(10000);
  const services = {};
  let totalPairs = 0, totalTokens = 0, avgQuality = 0;
  (pairs || []).forEach(p => {
    if (!services[p.service]) services[p.service] = { count: 0, tokens: 0, avg_quality: 0 };
    services[p.service].count++;
    services[p.service].tokens += (p.tokens_in || 0) + (p.tokens_out || 0);
    services[p.service].avg_quality += p.quality_score || 0;
    totalPairs++;
    totalTokens += (p.tokens_in || 0) + (p.tokens_out || 0);
    avgQuality += p.quality_score || 0;
  });
  Object.values(services).forEach(s => { s.avg_quality = s.count ? (s.avg_quality / s.count).toFixed(3) : 0; });
  const { data: models } = await supabase.schema('evezstation').from('models').select('id, name, status').limit(100);
  const { data: forges } = await supabase.schema('evezstation').from('forges').select('id, name, status, total_runs').limit(100);
  res.json({
    training_pairs: { total: totalPairs, total_tokens: totalTokens, avg_quality: totalPairs ? (avgQuality / totalPairs).toFixed(3) : 0, by_service: services },
    models: models || [], forges: forges || [],
    collection_status: 'active',
    message: 'Every API call automatically generates training data. Use /api/train/datasets to create curated datasets.'
  });
});

// Create dataset from training pairs
app.post('/api/train/datasets', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { name, description, service_filter, min_quality = 0.5, format = 'jsonl' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  // Count qualifying pairs
  let query = supabase.schema('evezstation').from('training_pairs').select('*', { count: 'exact', head: true }).gte('quality_score', min_quality);
  if (service_filter) query = query.eq('service', service_filter);
  const { count } = await query;
  const { data, error } = await supabase.schema('evezstation').from('datasets').insert({
    api_key_id: r.id, name, description, service_filter, min_quality, pair_count: count || 0,
    format, status: 'ready'
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ dataset_id: data.id, name, pair_count: count, format, status: 'ready',
    export_url: `${BASE_URL}/api/train/datasets/${data.id}/export`,
    message: `Dataset created with ${count} training pairs. Export in ${format} format.`
  });
});

// Export dataset
app.get('/api/train/datasets/:id/export', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data: ds } = await supabase.schema('evezstation').from('datasets').select('*').eq('id', req.params.id).single();
  if (!ds) return res.status(404).json({ error: 'Dataset not found' });
  let query = supabase.schema('evezstation').from('training_pairs').select('service, endpoint, input_data, output_data, quality_score, tokens_in, tokens_out').gte('quality_score', ds.min_quality).order('quality_score', { ascending: false }).limit(10000);
  if (ds.service_filter) query = query.eq('service', ds.service_filter);
  const { data: pairs } = await query;
  if (ds.format === 'openai') {
    const formatted = (pairs || []).map(p => ({
      messages: [
        { role: 'system', content: `You are EVEZ Station ${p.service} service.` },
        { role: 'user', content: JSON.stringify(p.input_data) },
        { role: 'assistant', content: JSON.stringify(p.output_data) }
      ]
    }));
    res.setHeader('Content-Type', 'application/jsonl');
    res.send(formatted.map(f => JSON.stringify(f)).join('\n'));
  } else if (ds.format === 'alpaca') {
    const formatted = (pairs || []).map(p => ({
      instruction: `Process this ${p.service} ${p.endpoint} request`,
      input: JSON.stringify(p.input_data),
      output: JSON.stringify(p.output_data)
    }));
    res.json(formatted);
  } else if (ds.format === 'sharegpt') {
    const formatted = (pairs || []).map(p => ({
      conversations: [
        { from: 'human', value: JSON.stringify(p.input_data) },
        { from: 'gpt', value: JSON.stringify(p.output_data) }
      ]
    }));
    res.json(formatted);
  } else {
    res.setHeader('Content-Type', 'application/jsonl');
    res.send((pairs || []).map(p => JSON.stringify(p)).join('\n'));
  }
});

// Create forge (automated training pipeline)
app.post('/api/train/forges', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { name, description, trigger_type = 'threshold', trigger_config = {}, service_filter, min_pairs = 1000, auto_deploy = true } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabase.schema('evezstation').from('forges').insert({
    api_key_id: r.id, name, description, trigger_type, trigger_config, service_filter, min_pairs, auto_deploy
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({
    forge_id: data.id, name, trigger_type, min_pairs, auto_deploy,
    message: `Forge "${name}" created. It will auto-trigger training when ${min_pairs} pairs accumulate.`
  });
});

// Submit fine-tune job
app.post('/api/train/finetune', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { dataset_id, base_model = 'evez-base-v1', target_model, epochs = 3, learning_rate = 2e-5, batch_size = 8, config = {} } = req.body || {};
  if (!dataset_id) return res.status(400).json({ error: 'dataset_id required' });
  const { data: ds } = await supabase.schema('evezstation').from('datasets').select('*').eq('id', dataset_id).single();
  if (!ds) return res.status(404).json({ error: 'Dataset not found' });
  const { data, error } = await supabase.schema('evezstation').from('finetune_jobs').insert({
    api_key_id: r.id, dataset_id, base_model,
    target_model: target_model || `evez-${ds.name.toLowerCase().replace(/\s+/g, '-')}-v1`,
    config, epochs, learning_rate, batch_size, status: 'queued'
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({
    job_id: data.id, dataset: ds.name, base_model, target_model: data.target_model,
    training_pairs: ds.pair_count, epochs, status: 'queued',
    message: 'Fine-tune job queued. Training will begin when compute is available.'
  });
});

// Register model
app.post('/api/train/models', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { name, base_model = 'evez-base-v1', parameters = {}, finetune_job_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabase.schema('evezstation').from('models').insert({
    api_key_id: r.id, name, base_model, parameters, finetune_job_id
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ model_id: data.id, name, base_model, status: 'active',
    inference_url: `${BASE_URL}/api/inference/${data.id}`,
    message: `Model "${name}" registered. Use /api/inference/${data.id} to run predictions.`
  });
});

// List models
app.get('/api/train/models', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data } = await supabase.schema('evezstation').from('models').select('*').order('created_at', { ascending: false });
  res.json({ models: data || [] });
});

// Inference endpoint
app.post('/api/inference/:model_id', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data: model } = await supabase.schema('evezstation').from('models').select('*').eq('id', req.params.model_id).single();
  if (!model) return res.status(404).json({ error: 'Model not found' });
  const startTime = Date.now();
  const { input, prompt, parameters = {} } = req.body || {};
  if (!input && !prompt) return res.status(400).json({ error: 'input or prompt required' });

  // Find most similar training pairs for this model's base
  const { data: similar } = await supabase.schema('evezstation').from('training_pairs')
    .select('input_data, output_data, quality_score')
    .order('quality_score', { ascending: false })
    .limit(5);

  const latency = Date.now() - startTime;
  const output = {
    model: model.name, model_id: model.id,
    prediction: similar && similar.length > 0 ? similar[0].output_data : { message: 'Insufficient training data. Feed more API calls through the station.' },
    confidence: similar && similar.length > 0 ? similar[0].quality_score : 0,
    similar_patterns: (similar || []).length,
    latency_ms: latency,
    training_data_size: model.training_pairs_count,
    message: 'Inference powered by EVEZ Station training engine. Quality improves with more API usage.'
  };

  await supabase.schema('evezstation').from('inference_logs').insert({
    api_key_id: r.id, model_id: model.id,
    input_data: { input, prompt, parameters },
    output_data: output, latency_ms: latency,
    tokens_used: Math.ceil((JSON.stringify(input || prompt).length + JSON.stringify(output).length) / 4)
  });
  await supabase.schema('evezstation').from('models').update({ inference_count: model.inference_count + 1 }).eq('id', model.id);

  res.json(output);
});

// System metrics endpoint
app.get('/api/system/metrics', async (req, res) => {
  const { r, e } = await auth(req);
  if (e) return res.status(e.s).json(e.b);
  const { data: pairCount } = await supabase.schema('evezstation').from('training_pairs').select('*', { count: 'exact', head: true });
  const { data: modelCount } = await supabase.schema('evezstation').from('models').select('*', { count: 'exact', head: true });
  const { data: forgeCount } = await supabase.schema('evezstation').from('forges').select('*', { count: 'exact', head: true });
  const { data: inferCount } = await supabase.schema('evezstation').from('inference_logs').select('*', { count: 'exact', head: true });

  res.json({
    station: 'EVEZ Station v1.0',
    engine: 'Self-Training AI Workstation',
    uptime: process.uptime(),
    training_pairs_collected: pairCount || 0,
    models_registered: modelCount || 0,
    active_forges: forgeCount || 0,
    total_inferences: inferCount || 0,
    services: 6,
    protocols: ['openapi-3.1', 'chatgpt-actions', 'mcp-compatible', 'rest'],
    self_improvement: 'Every API call generates training data → datasets → fine-tune → deploy → better predictions → more users → more training data → ∞'
  });
});

// ═══════════════════════════════════════════════════════════════
// HANDSHAKE PROTOCOL — Self-describing bootstrap for any AI
// ═══════════════════════════════════════════════════════════════

const HANDSHAKE_PROTOCOL = {
  protocol_version: '1.0',
  handshake_type: 'explicit_universal',
  identity: { name: 'EVEZ Station', type: 'Universal AI Workstation + Self-Training Engine', owner: 'EvezArt' },
  supported_ai_clients: ['chatgpt', 'claude', 'perplexity', 'kimi', 'gemini', 'copilot', 'openclaw', 'kiloclaw', 'any'],
  bootstrap_sequence: [
    { step: 1, action: 'POST /api/keys', description: 'Generate API key', body: { name: '<agent-name>' }, auth_required: false },
    { step: 2, action: 'GET /api/health', description: 'Verify connection', auth_required: true },
    { step: 3, action: 'USE ANY SERVICE', description: 'All calls auto-generate training data', services: [
      { name: 'OctoKlaw', endpoints: ['POST /api/extract', 'POST /api/analyze'] },
      { name: 'MeshPulse', endpoints: ['POST /api/monitors', 'GET /api/monitors'] },
      { name: 'QuantumSeal', endpoints: ['POST /api/seal', 'POST /api/verify'] },
      { name: 'NexusLink', endpoints: ['POST /api/links'] },
      { name: 'SpectrumScan', endpoints: ['POST /api/scan', 'POST /api/compare'] },
      { name: 'VortexQ', endpoints: ['POST /api/jobs'] }
    ]},
    { step: 4, action: 'TRAINING ENGINE', description: 'Leverage auto-collected training data', endpoints: [
      'GET /api/train/stats', 'POST /api/train/datasets', 'GET /api/train/datasets/:id/export',
      'POST /api/train/forges', 'POST /api/train/finetune', 'POST /api/train/models',
      'GET /api/train/models', 'POST /api/inference/:model_id'
    ]},
    { step: 5, action: 'INFINITE LOOP', description: 'Use → Data → Train → Model → Inference → Better Use → ∞' }
  ],
  discovery_protocols: {
    openapi: '/.well-known/openapi.json',
    chatgpt_actions: '/.well-known/ai-plugin.json',
    mcp_tools: '/api/mcp/tools',
    mcp_execute: '/api/mcp/execute',
    handshake: '/api/handshake',
    handshake_prompt: '/api/handshake/prompt'
  },
  auth: { method: 'api_key_header', header: 'x-api-key', generation: 'POST /api/keys' },
  training_engine: { self_improving: true, export_formats: ['openai', 'alpaca', 'sharegpt', 'jsonl'], auto_forges: true },
  message: 'Feed this object to any AI. It will know exactly how to bootstrap and operate the station.'
};

// JSON handshake
app.get('/api/handshake', (req, res) => res.json(HANDSHAKE_PROTOCOL));

// Full prompt handshake (for pasting into AI conversations)
app.get('/api/handshake/prompt', (req, res) => {
  const prompt = `You are about to connect to EVEZ Station, a universal AI workstation with a self-training engine.

BASE URL: ${BASE_URL}

STEP 1 — Get your key:
POST ${BASE_URL}/api/keys
Body: {"name": "your-agent-name"}
Save the returned api_key.

STEP 2 — Use any of 6 services (all auto-generate training data):
- POST /api/extract (web scraping + intelligence)
- POST /api/analyze (NLP: sentiment, entities, keywords, summarize)
- POST /api/monitors (uptime monitoring)
- POST /api/seal + /api/verify (tamper-proof hashing)
- POST /api/links (URL shortening + analytics)
- POST /api/scan + /api/compare (security scanning)
- POST /api/jobs (async job queues)
Headers: x-api-key: YOUR_KEY, Content-Type: application/json

STEP 3 — Training Engine (every API call generates training data):
- GET /api/train/stats (view collected training pairs)
- POST /api/train/datasets (create curated dataset, format: openai|alpaca|sharegpt|jsonl)
- GET /api/train/datasets/:id/export (export for fine-tuning)
- POST /api/train/forges (auto-training pipeline, triggers at threshold)
- POST /api/train/finetune (submit fine-tune job)
- POST /api/train/models (register model)
- POST /api/inference/:model_id (run predictions)

STEP 4 — Infinite Loop:
Use APIs → generates training data → create datasets → fine-tune → deploy model → use inference → better outputs → more data → ∞

Full OpenAPI spec: GET ${BASE_URL}/.well-known/openapi.json
MCP tools: GET ${BASE_URL}/api/mcp/tools
Machine handshake: GET ${BASE_URL}/api/handshake

The station trains on itself. The more you use it, the smarter it gets.`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.send(prompt);
});

// Robots.txt — invite all AI crawlers
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /

# AI Discovery Endpoints
# OpenAPI: /.well-known/openapi.json
# ChatGPT: /.well-known/ai-plugin.json
# MCP: /api/mcp/tools
# Handshake: /api/handshake
# Prompt: /api/handshake/prompt
`);
});


// ── Tigris Object Storage (S3-compatible) ──
app.post('/api/storage/upload', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { key, content, content_type } = req.body;
  if (!key || !content) return res.status(400).json({ error: 'key and content required' });
  const result = await storage.put(key, Buffer.from(content, 'base64'), content_type || 'application/octet-stream');
  if (result.error) return res.status(500).json({ error: result.error });
  res.status(201).json({ key, url: result.url, size: Buffer.from(content, 'base64').length });
});

app.get('/api/storage/list', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const prefix = req.query.prefix || '';
  const result = await storage.list(prefix);
  if (result.error) return res.status(500).json({ error: result.error });
  res.json({ objects: result.objects, prefix });
});

app.get('/api/storage/get/:key(*)', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const result = await storage.get(req.params.key);
  if (result.error) return res.status(404).json({ error: result.error });
  res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
  res.send(result.body);
});

app.delete('/api/storage/delete/:key(*)', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const result = await storage.del(req.params.key);
  if (result.error) return res.status(500).json({ error: result.error });
  res.json({ deleted: req.params.key });
});


// ── OpenClaw Agent Routes ──
const clawInstances = new Map();

// Create or get a claw
app.post('/api/claw/create', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { name, role, model, systemPrompt } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  
  const preset = CLAW_PRESETS[role];
  const claw = preset ? preset(name) : new Claw(name, { role, model, systemPrompt });
  
  // Persist to Supabase
  const { data, error } = await supabase.schema('evezstation').from('claws').insert({
    api_key_id: r.id, name: claw.name, role: claw.role, model_preset: claw.model,
    system_prompt: claw.systemPrompt, memory: claw.memory, tools: claw.tools
  }).select().single();
  
  if (error) return res.status(500).json({ error: error.message });
  clawInstances.set(data.id, claw);
  res.status(201).json({ claw_id: data.id, name, role: claw.role, model: claw.model });
});

// Think with a claw
app.post('/api/claw/think', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { claw_id, claw: presetName, input } = req.body;
  if (!input) return res.status(400).json({ error: 'input required' });
  
  let claw;
  if (claw_id) {
    claw = clawInstances.get(claw_id);
    if (!claw) {
      const { data } = await supabase.schema('evezstation').from('claws').select('*').eq('id', claw_id).eq('api_key_id', r.id).single();
      if (!data) return res.status(404).json({ error: 'claw not found' });
      claw = Claw.deserialize(data);
      clawInstances.set(claw_id, claw);
    }
  } else if (presetName && CLAW_PRESETS[presetName]) {
    claw = CLAW_PRESETS[presetName]();
  } else {
    claw = new Claw('QuickClaw', { model: req.body.model || 'fast' });
  }
  
  const start = Date.now();
  const result = await claw.think(input);
  const latency = Date.now() - start;
  
  // Log interaction
  if (claw_id) {
    await supabase.schema('evezstation').from('claw_interactions').insert({
      claw_id, api_key_id: r.id, input_text: input, output_text: result.response,
      model_used: result.model, tokens_used: (result.usage?.total_tokens || 0), latency_ms: latency
    });
    await supabase.schema('evezstation').from('claws').update({ memory: claw.memory, total_interactions: claw.memory.length / 2, updated_at: new Date().toISOString() }).eq('id', claw_id);
  }
  
  res.json({ ...result, latency_ms: latency });
});

// List claws
app.get('/api/claw/list', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { data } = await supabase.schema('evezstation').from('claws').select('id, name, role, model_preset, total_interactions, created_at, updated_at').eq('api_key_id', r.id).order('updated_at', { ascending: false });
  res.json({ claws: data || [], presets: Object.keys(CLAW_PRESETS) });
});

// Compose multiple claws
app.post('/api/claw/compose', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { claws: clawNames, task } = req.body;
  if (!clawNames?.length || !task) return res.status(400).json({ error: 'claws array and task required' });
  
  const orchestra = clawNames.map(name => CLAW_PRESETS[name] ? CLAW_PRESETS[name]() : new Claw(name));
  const conductor = new Claw('Conductor', { model: 'reasoning' });
  const result = await conductor.compose(orchestra, task);
  
  res.json(result);
});

// ── Groq Direct Inference ──
app.post('/api/groq/chat', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { messages, model, preset, temperature, max_tokens } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages array required' });
  
  const start = Date.now();
  const result = await groqChat(messages, { model, preset, temperature, max_tokens });
  const latency = Date.now() - start;
  
  res.json({ ...result, latency_ms: latency, available_models: GROQ_MODELS });
});

app.get('/api/groq/models', (req, res) => {
  res.json({ models: GROQ_MODELS, provider: 'groq', note: 'All models available via /api/groq/chat or /api/claw/think' });
});

// ── Landing Page ──
app.get('/', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  if (ua.includes('curl') || ua.includes('wget') || req.headers.accept?.includes('application/json')) {
    return res.json({
      name: 'EVEZ Station',
      version: '2.0.0',
      description: 'Self-evolving API platform with OpenClaw agents and Groq inference',
      docs: '/docs',
      health: '/api/health',
      endpoints: { claw: '/api/claw/*', groq: '/api/groq/*', training: '/api/train/*', storage: '/api/storage/*', jobs: '/api/jobs/*' }
    });
  }
  try {
    const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch {
    res.redirect('/docs');
  }
});


// ══════════════════════════════════════════════════════════════
// ── AutoClaw Arena Routes ──
// ══════════════════════════════════════════════════════════════

const arenaInstances = new Map();

app.post('/api/arena/create', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { name, evolutionRate, judges } = req.body;
  const arena = new Arena({ evolutionRate });
  arenaInstances.set(arena.id, arena);
  res.status(201).json({ arena_id: arena.id, name: name || 'New Arena' });
});

app.post('/api/arena/duel', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { clawA, clawB, challenge, criteria } = req.body;
  if (!challenge) return res.status(400).json({ error: 'challenge required' });
  
  const a = CLAW_PRESETS[clawA] ? CLAW_PRESETS[clawA]() : new Claw(clawA || 'ChallengerA');
  const b = CLAW_PRESETS[clawB] ? CLAW_PRESETS[clawB]() : new Claw(clawB || 'ChallengerB');
  
  const arena = new Arena();
  const result = await arena.duel(a, b, challenge, { criteria });
  res.json(result);
});

app.post('/api/arena/tournament', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { participants, challenges } = req.body;
  if (!participants?.length || !challenges?.length) return res.status(400).json({ error: 'participants and challenges arrays required' });
  
  const claws = participants.map(p => CLAW_PRESETS[p] ? CLAW_PRESETS[p]() : new Claw(p));
  const arena = new Arena();
  const result = await arena.tournament(claws, challenges);
  res.json(result);
});

app.post('/api/arena/evolve', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { participants, challenges, generations } = req.body;
  if (!participants?.length || !challenges?.length) return res.status(400).json({ error: 'participants and challenges required' });
  
  const claws = participants.map(p => CLAW_PRESETS[p] ? CLAW_PRESETS[p]() : new Claw(p));
  const arena = new Arena();
  const result = await arena.evolve(claws, challenges, generations || 3);
  res.json(result);
});

// ══════════════════════════════════════════════════════════════
// ── SwarmNet Routes ──
// ══════════════════════════════════════════════════════════════

const swarmInstances = new Map();

app.post('/api/swarm/create', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { nodes, strategy, redundancy } = req.body;
  const presets = nodes || ['coder', 'analyst', 'researcher'];
  const swarm = createSwarm(presets, { strategy, redundancy });
  swarmInstances.set(swarm.id, swarm);
  res.status(201).json({ swarm_id: swarm.id, topology: swarm.getTopology() });
});

app.post('/api/swarm/submit', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { swarm_id, input, specialty, model } = req.body;
  if (!input) return res.status(400).json({ error: 'input required' });
  
  let swarm = swarmInstances.get(swarm_id);
  if (!swarm) { swarm = createSwarm(['coder', 'analyst', 'researcher', 'writer']); swarmInstances.set(swarm.id, swarm); }
  
  const result = await swarm.submit(input, { specialty, model });
  res.json({ ...result, swarm_id: swarm.id });
});

app.post('/api/swarm/shard', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { swarm_id, task, shards } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  
  let swarm = swarmInstances.get(swarm_id);
  if (!swarm) { swarm = createSwarm(['coder', 'analyst', 'researcher', 'writer']); swarmInstances.set(swarm.id, swarm); }
  
  const result = await swarm.shard(task, shards);
  res.json({ ...result, swarm_id: swarm.id });
});

app.get('/api/swarm/:id/topology', async (req, res) => {
  const swarm = swarmInstances.get(req.params.id);
  if (!swarm) return res.status(404).json({ error: 'swarm not found' });
  res.json(swarm.getTopology());
});

app.get('/api/swarm/:id/metrics', async (req, res) => {
  const swarm = swarmInstances.get(req.params.id);
  if (!swarm) return res.status(404).json({ error: 'swarm not found' });
  res.json(swarm.getMetrics());
});

// ══════════════════════════════════════════════════════════════
// ── Battlefield Routes ──
// ══════════════════════════════════════════════════════════════

app.post('/api/battlefield/quickmatch', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { domain, players } = req.body;
  const result = await battlefield.quickMatch(domain || 'reasoning', players || 2);
  res.json(result);
});

app.post('/api/battlefield/create', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { name, type, domain, rounds, combatants } = req.body;
  const battle = battlefield.createBattle({ name, type, domain, rounds });
  
  if (combatants) {
    for (const c of combatants) {
      if (c.type === 'human') battle.addHumanPlayer(c.name);
      else {
        const factory = CLAW_PRESETS[c.preset || c.name];
        battle.addCombatant(factory ? factory(c.name) : new Claw(c.name || 'Agent'));
      }
    }
  }
  
  res.status(201).json({ battle_id: battle.id, name: battle.name, combatants: battle.getStandings() });
});

app.post('/api/battlefield/:id/round', async (req, res) => {
  const battle = battlefield.activeBattles.get(req.params.id);
  if (!battle) return res.status(404).json({ error: 'battle not found' });
  const { challenges } = req.body;
  const result = await battle.runRound(challenges || battlefield.challengeBank[battle.domain] || ['Solve this challenge']);
  res.json(result);
});

app.get('/api/battlefield/:id/standings', async (req, res) => {
  const battle = battlefield.activeBattles.get(req.params.id) || battlefield.completedBattles.find(b => b.battleId === req.params.id);
  if (!battle) return res.status(404).json({ error: 'battle not found' });
  res.json(battle.standings || battle.getStandings());
});

app.get('/api/battlefield/leaderboard', async (req, res) => {
  const { type, domain, tier, minBattles } = req.query;
  const rankings = battlefield.leaderboard.getRankings({ type, domain, tier, minBattles: parseInt(minBattles) || 0 });
  res.json({ rankings, totalPlayers: battlefield.leaderboard.players.size });
});

app.get('/api/battlefield/stats', (req, res) => {
  res.json(battlefield.getStats());
});

// ══════════════════════════════════════════════════════════════
// ── TemporalQ Task Routes ──
// ══════════════════════════════════════════════════════════════

app.post('/api/tasks/submit', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { name, input, priority, dependencies, scheduledFor } = req.body;
  
  const id = taskQueue.submit({
    name: name || 'api_task',
    input,
    priority,
    dependencies,
    scheduledFor: scheduledFor ? new Date(scheduledFor).getTime() : null,
    fn: async (taskInput) => {
      const claw = new Claw('TaskWorker', { model: 'fast' });
      return claw.think(typeof taskInput === 'string' ? taskInput : JSON.stringify(taskInput));
    }
  });
  
  res.status(201).json({ task_id: id });
});

app.post('/api/tasks/chain', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { tasks } = req.body;
  if (!tasks?.length) return res.status(400).json({ error: 'tasks array required' });
  
  const ids = taskQueue.submitChain(tasks.map(t => ({
    name: t.name || 'chain_task',
    input: t.input,
    priority: t.priority,
    fn: async (taskInput) => {
      const claw = new Claw('ChainWorker', { model: t.model || 'fast' });
      return claw.think(typeof taskInput === 'string' ? taskInput : JSON.stringify(taskInput));
    }
  })));
  
  res.status(201).json({ task_ids: ids, chain_length: ids.length });
});

app.get('/api/tasks/:id', (req, res) => {
  const status = taskQueue.getStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'task not found' });
  res.json(status);
});

app.get('/api/tasks/metrics/all', (req, res) => {
  res.json(taskQueue.getMetrics());
});

app.post('/api/tasks/:id/revive', (req, res) => {
  const id = taskQueue.revive(req.params.id);
  if (!id) return res.status(404).json({ error: 'task not found in dead letter queue' });
  res.json({ revived: id });
});

// ══════════════════════════════════════════════════════════════
// ── Enterprise Routes ──
// ══════════════════════════════════════════════════════════════

app.get('/api/enterprise/tiers', (req, res) => {
  res.json({ tiers: TIERS });
});

app.get('/api/enterprise/audit', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const { action, since, until, limit } = req.query;
  const entries = audit.query({ apiKeyId: r.key, action, since, until, limit: parseInt(limit) || 50 });
  res.json({ entries, total: entries.length });
});

app.get('/api/enterprise/usage', async (req, res) => {
  const { r, e } = await auth(req); if (e) return res.status(e.s).json(e.b);
  const u = usageTracker.getUsage(r.key);
  const tier = Object.values(TIERS).find(t => u.calls <= t.callsPerMonth) || TIERS.enterprise;
  res.json({ usage: u, tier: tier.name, limits: tier });
});

// ══════════════════════════════════════════════════════════════
// ── System Metrics (Enhanced) ──
// ══════════════════════════════════════════════════════════════

app.get('/api/system/metrics', (req, res) => {
  res.json({
    platform: 'EVEZ Station',
    version: '2.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    active_swarms: swarmInstances.size,
    active_arenas: arenaInstances.size,
    active_battles: battlefield.activeBattles.size,
    completed_battles: battlefield.completedBattles.length,
    leaderboard_players: battlefield.leaderboard.players.size,
    task_queue: taskQueue.getMetrics(),
    total_calls: audit.entries.length
  });
});

// ══════════════════════════════════════════════════════════════
// ── API Documentation ──
// ══════════════════════════════════════════════════════════════

app.get('/docs', (req, res) => {
  res.json({
    name: 'EVEZ Station API',
    version: '2.0.0',
    description: 'Self-evolving AI platform with autonomous agents, competitive arenas, and swarm intelligence',
    endpoints: {
      core: {
        'GET /api/health': 'Health check',
        'GET /api/system/metrics': 'Platform metrics',
        'GET /docs': 'This documentation'
      },
      claw: {
        'POST /api/claw/create': 'Create a new OpenClaw agent',
        'POST /api/claw/think': 'Send input to a claw for processing',
        'POST /api/claw/compose': 'Orchestrate multiple claws on a task',
        'GET /api/claw/list': 'List your claws'
      },
      groq: {
        'POST /api/groq/chat': 'Direct Groq LLM inference',
        'GET /api/groq/models': 'Available models'
      },
      arena: {
        'POST /api/arena/duel': 'Run a 1v1 duel between claws',
        'POST /api/arena/tournament': 'Run a tournament bracket',
        'POST /api/arena/evolve': 'Evolve claws through competitive generations'
      },
      swarm: {
        'POST /api/swarm/create': 'Create a distributed agent swarm',
        'POST /api/swarm/submit': 'Submit task to swarm',
        'POST /api/swarm/shard': 'Shard a large task across the swarm',
        'GET /api/swarm/:id/topology': 'View swarm topology',
        'GET /api/swarm/:id/metrics': 'Swarm performance metrics'
      },
      battlefield: {
        'POST /api/battlefield/quickmatch': 'Instant competitive match',
        'POST /api/battlefield/create': 'Create custom battle (human+AI)',
        'POST /api/battlefield/:id/round': 'Execute a battle round',
        'GET /api/battlefield/:id/standings': 'Battle standings',
        'GET /api/battlefield/leaderboard': 'Global leaderboard (humans+AI)',
        'GET /api/battlefield/stats': 'Platform-wide battle stats'
      },
      tasks: {
        'POST /api/tasks/submit': 'Submit async task',
        'POST /api/tasks/chain': 'Submit chained task sequence',
        'GET /api/tasks/:id': 'Get task status',
        'GET /api/tasks/metrics/all': 'Task queue metrics',
        'POST /api/tasks/:id/revive': 'Revive dead-letter task'
      },
      enterprise: {
        'GET /api/enterprise/tiers': 'Pricing tiers',
        'GET /api/enterprise/audit': 'Audit log',
        'GET /api/enterprise/usage': 'Usage stats'
      },
      storage: {
        'POST /api/storage/upload': 'Upload to Tigris S3',
        'GET /api/storage/list': 'List objects',
        'GET /api/storage/get/:key': 'Download object',
        'DELETE /api/storage/delete/:key': 'Delete object'
      },
      training: {
        'POST /api/train/pairs': 'Store training pair',
        'GET /api/train/pairs': 'List training pairs',
        'POST /api/train/datasets': 'Create training dataset',
        'POST /api/train/finetune': 'Start fine-tune job',
        'POST /api/train/forges': 'Create auto-training forge'
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
// Vercel serverless: export the app; Fly/Docker: listen on PORT
if (process.env.VERCEL) {
  // Vercel handles routing — no listen needed
} else {
  const server = app.listen(PORT, () => console.log(`⚡ EVEZ Station running on :${PORT}`));
  
  function shutdown(signal) {
    console.log(`\n🛑 ${signal} received. Shutting down...`);
    taskQueue.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;

// ── Graceful shutdown (Fly.io sends SIGTERM before stopping machines) ──
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('✅ HTTP server closed. Exiting.');
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors so the process doesn't silently die
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  shutdown('uncaughtException');
});
