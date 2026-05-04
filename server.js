const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { ClawAgent } = require('./lib/agent');
const { chat: groqChat, batch: groqBatch, listModels } = require('./lib/groq');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Supabase
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Active agents store (in-memory, backed to Supabase)
const agents = new Map();

// ═══════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0',
    platform: 'EVEZ Station',
    services: {
      groq: !!process.env.GROQ_API_KEY,
      supabase: !!supabase,
      agents: agents.size,
    },
    ts: Date.now()
  });
});

// ═══════════════════════════════════════
// GROQ INFERENCE
// ═══════════════════════════════════════
app.post('/api/groq/chat', async (req, res) => {
  try {
    const { message, model = 'default', system, temperature, max_tokens } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await groqChat(message, { model, system, temperature, maxTokens: max_tokens });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groq/batch', async (req, res) => {
  try {
    const { prompts, model = 'default', system } = req.body;
    if (!prompts?.length) return res.status(400).json({ error: 'prompts array required' });
    const results = await groqBatch(prompts, { model, system });
    res.json({ results, count: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/groq/models', (req, res) => {
  res.json({ models: listModels() });
});

// ═══════════════════════════════════════
// OPENCLAW AGENTS
// ═══════════════════════════════════════
app.post('/api/claw/create', (req, res) => {
  const { name, model = 'default', system } = req.body;
  const id = `claw_${Date.now()}`;
  const agent = new ClawAgent(name || id, model, system);
  agents.set(id, agent);
  res.json({ id, agent: agent.serialize() });
});

app.post('/api/claw/think', async (req, res) => {
  try {
    const { id, prompt, context } = req.body;
    if (!id || !prompt) return res.status(400).json({ error: 'id + prompt required' });
    
    let agent = agents.get(id);
    if (!agent) {
      // Create ephemeral agent
      agent = new ClawAgent(id, 'default');
      agents.set(id, agent);
    }
    
    const result = await agent.think(prompt, context);
    
    // Log to Supabase if available
    if (supabase) {
      supabase.from('claw_interactions').insert({
        claw_id: id, prompt, response: result.response,
        model: result.model, latency_ms: result.latencyMs
      }).then(() => {}).catch(() => {});
    }
    
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/claw/task', async (req, res) => {
  try {
    const { id, task, max_steps = 5 } = req.body;
    if (!id || !task) return res.status(400).json({ error: 'id + task required' });
    let agent = agents.get(id);
    if (!agent) { agent = new ClawAgent(id); agents.set(id, agent); }
    const result = await agent.runTask(task, max_steps);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/claw/list', (req, res) => {
  const list = Array.from(agents.entries()).map(([id, a]) => ({ id, ...a.serialize() }));
  res.json({ agents: list, count: list.length });
});

app.delete('/api/claw/:id', (req, res) => {
  const deleted = agents.delete(req.params.id);
  res.json({ deleted, id: req.params.id });
});

// ═══════════════════════════════════════
// ECOSYSTEM STATUS
// ═══════════════════════════════════════
app.get('/api/ecosystem', (req, res) => {
  res.json({
    platform: 'EVEZ Station v3.0',
    repos: [
      'evezstation', 'openclaw', 'evez-hyperstream', 'evez-vcl-core',
      'evez666-arg-canon', 'evez-agentnet', 'Evez666', 'evez-autonomous-ledger'
    ],
    streams: [
      { name: 'Hypergeometric 2D', url: 'https://youtube.com/watch?v=a0bPZMrznIM' },
      { name: 'Hypergeometric 3D', url: 'https://youtube.com/watch?v=_5l0CfgE3g0' },
      { name: '4D Polytope Arena', url: 'https://youtube.com/watch?v=-5FDrSt7nZc' },
      { name: 'Reactive Neural Lattice', url: 'https://youtube.com/watch?v=0n8_Kkaijfk' },
      { name: 'AI Arena', url: 'https://youtube.com/watch?v=HhgWYqc8rbg' },
      { name: 'Mandelbrot Reactive', url: 'https://youtube.com/watch?v=x-q93pHVUoA' },
      { name: 'Fourier Arena', url: 'https://youtube.com/watch?v=1igd9N7kqqI' },
      { name: 'EVEZ666 Cognitive', url: 'https://youtube.com/watch?v=AZKZDbM2Fbk' },
    ],
    ts: Date.now()
  });
});

// ═══════════════════════════════════════
// LANDING FALLBACK
// ═══════════════════════════════════════
app.get('/', (req, res) => {
  if (require('fs').existsSync('./public/index.html')) {
    res.sendFile(require('path').join(__dirname, 'public/index.html'));
  } else {
    res.json({ platform: 'EVEZ Station v3.0', status: 'operational', url: '/api/health' });
  }
});

app.listen(PORT, () => {
  console.log(`EVEZ Station v3.0 running on :${PORT}`);
  console.log(`Groq: ${process.env.GROQ_API_KEY ? '✅' : '❌'} | Supabase: ${supabase ? '✅' : '❌'}`);
});

module.exports = app;
