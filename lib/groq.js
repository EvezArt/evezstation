// EVEZ Groq Inference Engine v2
const Groq = require('groq-sdk');

const MODELS = {
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  'llama-3.1-8b':  'llama-3.1-8b-instant',
  'qwen-32b':      'qwen/qwen3-32b',
  'compound':      'groq/compound',
  'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'default':       'llama-3.3-70b-versatile',
};

const getClient = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

async function chat(message, { model = 'default', system = null, temperature = 0.7, maxTokens = 2048 } = {}) {
  const client = getClient();
  const modelId = MODELS[model] || model;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: message });
  const start = Date.now();
  const resp = await client.chat.completions.create({
    model: modelId, messages, temperature, max_tokens: maxTokens
  });
  return {
    content: resp.choices[0].message.content,
    model: modelId,
    latencyMs: Date.now() - start,
    tokens: resp.usage?.total_tokens
  };
}

async function batch(prompts, opts = {}) {
  return Promise.all(prompts.map(p => chat(p, opts)));
}

module.exports = { chat, batch, MODELS, listModels: () => Object.keys(MODELS) };
