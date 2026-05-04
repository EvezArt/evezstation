// EVEZ OpenClaw Agent v3 (Node.js wrapper)
// Auto-converted from Python core
const Groq = require('groq-sdk');

const MODELS = {
  fast: 'llama-3.1-8b-instant',
  smart: 'llama-3.3-70b-versatile', 
  reason: 'qwen/qwen3-32b',
  default: 'llama-3.3-70b-versatile',
};

class ClawAgent {
  constructor(name = 'ClawAgent', model = 'default', system = null) {
    this.name = name;
    this.model = MODELS[model] || model;
    this.system = system || `You are ${name}, an autonomous EVEZ AI agent.`;
    this.memory = [];
    this.sessionId = Math.random().toString(36).slice(2);
    this.groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
  }

  async think(prompt, context = null) {
    if (!this.groq) return { error: 'GROQ_API_KEY not set' };
    const start = Date.now();
    const messages = [{ role: 'system', content: this.system }];
    if (this.memory.length > 0) {
      const recent = this.memory.slice(-6).map(m => `[${m.role}]: ${m.content.slice(0,200)}`).join('\n');
      messages.push({ role: 'system', content: `Recent memory:\n${recent}` });
    }
    if (context) messages.push({ role: 'system', content: `Context: ${JSON.stringify(context)}` });
    messages.push({ role: 'user', content: prompt });
    
    try {
      const resp = await this.groq.chat.completions.create({
        model: this.model, messages, max_tokens: 2048, temperature: 0.7
      });
      const content = resp.choices[0].message.content;
      this.memory.push({ role: 'user', content: prompt });
      this.memory.push({ role: 'assistant', content });
      return { response: content, latencyMs: Date.now() - start, model: this.model,
               tokens: resp.usage?.total_tokens, sessionId: this.sessionId };
    } catch(e) {
      return { error: e.message, response: null };
    }
  }

  async runTask(task, maxSteps = 5) {
    const steps = [];
    for (let i = 0; i < maxSteps; i++) {
      const result = await this.think(i === 0 ? task : `Continue: ${task}`);
      steps.push(result);
      if (result.response?.toLowerCase().match(/done|complete|finished/)) break;
    }
    return { task, steps, totalSteps: steps.length };
  }

  serialize() {
    return { name: this.name, model: this.model, memorySize: this.memory.length, sessionId: this.sessionId };
  }
}

module.exports = { ClawAgent, MODELS };
