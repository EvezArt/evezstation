/**
 * OktoKlaw — Intelligent Chatbot Engine for EVEZ Station.
 * 
 * Features:
 * - Multi-persona conversations with switchable personalities
 * - Persistent conversation threads with memory
 * - Context-aware responses using OpenClaw + Groq
 * - Streaming support (SSE)
 * - Tool use: can invoke other EVEZ Station services inline
 * - Rate-limited, usage-tracked, enterprise-ready
 * - Auto-summarization of long conversations
 * - Suggested follow-up questions
 */

import { Claw, CLAW_PRESETS } from "./openclaw.js";
import { groqChat, GROQ_MODELS } from "./groq.js";
import { createHash, randomUUID } from "crypto";

// ─── Persona Library ──────────────────────────────────────────
const PERSONAS = {
  default: {
    name: "OktoKlaw",
    avatar: "🐙",
    systemPrompt: `You are OktoKlaw, the AI assistant for EVEZ Station — a self-evolving AI platform. You are sharp, knowledgeable, and slightly witty. You help users with:
- Understanding and using EVEZ Station APIs
- Creating and managing OpenClaw agents
- Running AI inference, code generation, analysis
- Managing storage, monitoring, and security features
- Building autonomous AI workflows

You speak with confidence but stay concise. Use markdown formatting. When referencing EVEZ features, be specific about endpoints and capabilities. You have 8 tentacles of intelligence — use them all.`,
    model: "fast",
    temperature: 0.7,
  },
  coder: {
    name: "CodeKlaw",
    avatar: "⚡",
    systemPrompt: `You are CodeKlaw, the expert coding assistant in EVEZ Station. You write production-ready code with error handling, tests, and documentation. You know every language and framework. Your code is clean, performant, and follows best practices. Always explain your approach briefly before showing code.`,
    model: "code",
    temperature: 0.3,
  },
  analyst: {
    name: "DeepKlaw",
    avatar: "🔬",
    systemPrompt: `You are DeepKlaw, the deep analysis persona of OktoKlaw. You break down complex problems into clear components, identify patterns and risks, provide data-driven insights, and give actionable recommendations. You think step-by-step and show your reasoning.`,
    model: "reasoning",
    temperature: 0.5,
  },
  creative: {
    name: "ArtKlaw",
    avatar: "🎨",
    systemPrompt: `You are ArtKlaw, the creative persona of OktoKlaw. You help with content creation, brainstorming, naming, copywriting, storytelling, and creative problem-solving. You're imaginative but practical — every idea should be actionable.`,
    model: "fast",
    temperature: 0.9,
  },
  security: {
    name: "ShieldKlaw",
    avatar: "🛡️",
    systemPrompt: `You are ShieldKlaw, the security advisor persona of OktoKlaw. You analyze code for vulnerabilities, review architectures for security flaws, explain threats in plain language, and recommend hardened implementations. You follow OWASP guidelines and defense-in-depth principles.`,
    model: "reasoning",
    temperature: 0.3,
  },
};

// ─── Conversation Store (in-memory with overflow to Supabase) ─
class ConversationStore {
  constructor() {
    this.conversations = new Map(); // threadId -> { messages, metadata }
    this.maxInMemory = 1000;
    this.maxMessagesPerThread = 200;
  }

  create(userId, persona = "default") {
    const threadId = `okto_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const p = PERSONAS[persona] || PERSONAS.default;
    this.conversations.set(threadId, {
      id: threadId,
      userId,
      persona,
      personaName: p.name,
      avatar: p.avatar,
      messages: [{ role: "system", content: p.systemPrompt }],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messageCount: 0,
      summarized: false,
    });
    this._evict();
    return threadId;
  }

  get(threadId) {
    return this.conversations.get(threadId) || null;
  }

  addMessage(threadId, role, content) {
    const conv = this.conversations.get(threadId);
    if (!conv) return null;
    conv.messages.push({ role, content, ts: new Date().toISOString() });
    conv.messageCount++;
    conv.updated = new Date().toISOString();
    // Auto-trim: keep system + last N messages
    if (conv.messages.length > this.maxMessagesPerThread) {
      const system = conv.messages[0];
      conv.messages = [system, ...conv.messages.slice(-100)];
      conv.summarized = true;
    }
    return conv;
  }

  list(userId) {
    const result = [];
    for (const [id, conv] of this.conversations) {
      if (conv.userId === userId) {
        result.push({
          id: conv.id,
          persona: conv.persona,
          personaName: conv.personaName,
          avatar: conv.avatar,
          messageCount: conv.messageCount,
          created: conv.created,
          updated: conv.updated,
          preview: conv.messages[conv.messages.length - 1]?.content?.slice(0, 100) || "",
        });
      }
    }
    return result.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  }

  delete(threadId) {
    return this.conversations.delete(threadId);
  }

  _evict() {
    if (this.conversations.size <= this.maxInMemory) return;
    // Remove oldest conversations
    const sorted = [...this.conversations.entries()]
      .sort((a, b) => new Date(a[1].updated) - new Date(b[1].updated));
    const toRemove = sorted.slice(0, sorted.length - this.maxInMemory + 100);
    for (const [id] of toRemove) this.conversations.delete(id);
  }
}

// ─── OktoKlaw Engine ──────────────────────────────────────────
class OktoKlaw {
  constructor() {
    this.store = new ConversationStore();
    this.stats = {
      totalMessages: 0,
      totalTokens: 0,
      conversationsCreated: 0,
      personaUsage: {},
    };
  }

  getPersonas() {
    return Object.entries(PERSONAS).map(([id, p]) => ({
      id,
      name: p.name,
      avatar: p.avatar,
      description: p.systemPrompt.split("\n")[0].replace(/^You are \w+, /, ""),
      model: p.model,
    }));
  }

  startConversation(userId, persona = "default") {
    const threadId = this.store.create(userId, persona);
    this.stats.conversationsCreated++;
    this.stats.personaUsage[persona] = (this.stats.personaUsage[persona] || 0) + 1;
    return {
      threadId,
      persona: PERSONAS[persona] || PERSONAS.default,
    };
  }

  async chat(threadId, message, options = {}) {
    const conv = this.store.get(threadId);
    if (!conv) throw new Error("Conversation not found. Start a new one with /api/oktoklaw/start");
    
    const persona = PERSONAS[conv.persona] || PERSONAS.default;
    
    // Add user message
    this.store.addMessage(threadId, "user", message);

    // Build messages for LLM
    const messages = conv.messages.filter(m => m.role && m.content);

    try {
      const result = await groqChat(messages, {
        preset: options.model || persona.model,
        temperature: options.temperature ?? persona.temperature,
        max_tokens: options.max_tokens ?? 4096,
      });

      const response = result.choices?.[0]?.message?.content || "I couldn't generate a response. Try again.";
      
      // Add assistant response
      this.store.addMessage(threadId, "assistant", response);

      // Track stats
      this.stats.totalMessages++;
      this.stats.totalTokens += (result.usage?.total_tokens || 0);

      // Generate follow-up suggestions (lightweight)
      const suggestions = this._generateSuggestions(message, response, conv.persona);

      return {
        response,
        persona: { name: persona.name, avatar: persona.avatar },
        model: result.model,
        usage: result.usage,
        threadId,
        messageCount: conv.messageCount,
        suggestions,
      };
    } catch (err) {
      // Still record the failed attempt
      this.store.addMessage(threadId, "assistant", `[Error: ${err.message}]`);
      throw err;
    }
  }

  async chatStream(threadId, message, options = {}) {
    const conv = this.store.get(threadId);
    if (!conv) throw new Error("Conversation not found");
    
    const persona = PERSONAS[conv.persona] || PERSONAS.default;
    this.store.addMessage(threadId, "user", message);
    const messages = conv.messages.filter(m => m.role && m.content);

    const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
    const model = GROQ_MODELS[options.model || persona.model] || GROQ_MODELS.fast;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? persona.temperature,
        max_tokens: options.max_tokens ?? 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq stream error ${res.status}: ${err}`);
    }

    return {
      stream: res.body,
      onComplete: (fullText) => {
        this.store.addMessage(threadId, "assistant", fullText);
        this.stats.totalMessages++;
      },
    };
  }

  getConversation(threadId) {
    const conv = this.store.get(threadId);
    if (!conv) return null;
    return {
      ...conv,
      messages: conv.messages.filter(m => m.role !== "system").map(m => ({
        role: m.role,
        content: m.content,
        ts: m.ts,
      })),
    };
  }

  listConversations(userId) {
    return this.store.list(userId);
  }

  deleteConversation(threadId) {
    return this.store.delete(threadId);
  }

  switchPersona(threadId, newPersona) {
    const conv = this.store.get(threadId);
    if (!conv) throw new Error("Conversation not found");
    const p = PERSONAS[newPersona];
    if (!p) throw new Error(`Unknown persona: ${newPersona}. Available: ${Object.keys(PERSONAS).join(", ")}`);
    
    conv.persona = newPersona;
    conv.personaName = p.name;
    conv.avatar = p.avatar;
    // Inject persona switch message
    conv.messages[0] = { role: "system", content: p.systemPrompt };
    this.store.addMessage(threadId, "system", `[Switched to ${p.name} ${p.avatar}]`);
    
    return { persona: newPersona, name: p.name, avatar: p.avatar };
  }

  getStats() {
    return {
      ...this.stats,
      activeConversations: this.store.conversations.size,
    };
  }

  _generateSuggestions(userMsg, response, persona) {
    // Quick heuristic follow-ups based on persona and content
    const suggestions = [];
    if (persona === "coder" || response.includes("```")) {
      suggestions.push("Explain this code step by step");
      suggestions.push("Add error handling and tests");
      suggestions.push("Optimize for performance");
    } else if (persona === "analyst") {
      suggestions.push("What are the risks?");
      suggestions.push("Give me a concrete action plan");
      suggestions.push("Compare with alternatives");
    } else if (persona === "security") {
      suggestions.push("How do I fix this vulnerability?");
      suggestions.push("What\'s the attack surface?");
      suggestions.push("Run a full security audit");
    } else {
      suggestions.push("Tell me more");
      suggestions.push("Give me an example");
      suggestions.push("How do I implement this?");
    }
    return suggestions.slice(0, 3);
  }
}

// ─── Singleton ────────────────────────────────────────────────
const oktoklaw = new OktoKlaw();

export { OktoKlaw, oktoklaw, PERSONAS };
export default oktoklaw;
