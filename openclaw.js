/**
 * OpenClaw — Self-improving AI agent framework for EVEZ Station.
 * Each "claw" is an autonomous agent that learns from its own API calls.
 * Claws can compose, delegate, and evolve.
 */

import { groqChat, GROQ_MODELS } from "./groq.js";

class Claw {
  constructor(name, config = {}) {
    this.name = name;
    this.role = config.role || "general";
    this.model = config.model || "fast";
    this.memory = [];
    this.systemPrompt = config.systemPrompt || `You are ${name}, an AI agent in the EVEZ Station platform. You are precise, efficient, and self-improving.`;
    this.tools = config.tools || [];
    this.maxMemory = config.maxMemory || 50;
  }

  async think(input, context = {}) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...this.memory.slice(-this.maxMemory),
      { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
    ];

    const result = await groqChat(messages, { preset: this.model, ...context });
    const response = result.choices?.[0]?.message?.content || "";

    // Learn from interaction
    this.memory.push({ role: "user", content: typeof input === "string" ? input : JSON.stringify(input) });
    this.memory.push({ role: "assistant", content: response });

    return {
      response,
      model: result.model,
      usage: result.usage,
      claw: this.name,
    };
  }

  async compose(claws, task) {
    // Orchestrate multiple claws for complex tasks
    const results = [];
    for (const claw of claws) {
      const subResult = await claw.think(`As part of the larger task: "${task}", handle your part. Previous results: ${JSON.stringify(results.map(r => r.response).slice(-3))}`);
      results.push(subResult);
    }
    // Synthesize
    const synthesis = await this.think(`Synthesize these results into a final answer for: "${task}"\n\nResults:\n${results.map(r => `[${r.claw}]: ${r.response}`).join("\n")}`);
    return { synthesis: synthesis.response, parts: results };
  }

  serialize() {
    return { name: this.name, role: this.role, model: this.model, memory: this.memory, tools: this.tools };
  }

  static deserialize(data) {
    const claw = new Claw(data.name, { role: data.role, model: data.model, tools: data.tools });
    claw.memory = data.memory || [];
    return claw;
  }
}

// Pre-built specialized claws
export const CLAW_PRESETS = {
  coder: (name = "CodeClaw") => new Claw(name, {
    role: "code_generation",
    model: "code",
    systemPrompt: `You are ${name}, an expert code generation agent. Write clean, production-ready code. Always include error handling. Prefer modern patterns.`,
  }),
  analyst: (name = "AnalystClaw") => new Claw(name, {
    role: "analysis",
    model: "reasoning",
    systemPrompt: `You are ${name}, a deep analysis agent. Break down complex problems. Identify patterns. Provide actionable insights with evidence.`,
  }),
  writer: (name = "WriterClaw") => new Claw(name, {
    role: "content",
    model: "fast",
    systemPrompt: `You are ${name}, a content creation agent. Write compelling, clear, and engaging content. Match the tone to the audience.`,
  }),
  researcher: (name = "ResearchClaw") => new Claw(name, {
    role: "research",
    model: "reasoning",
    systemPrompt: `You are ${name}, a research agent. Gather information, synthesize findings, identify gaps in knowledge. Be thorough and cite sources when possible.`,
  }),
};

export { Claw };
export default Claw;
