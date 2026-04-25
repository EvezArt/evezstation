import { createClient } from "@supabase/supabase-js";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const MODELS = {
  fast: "llama-3.3-70b-versatile",
  reasoning: "deepseek-r1-distill-llama-70b",
  small: "llama-3.1-8b-instant",
  vision: "llama-3.2-90b-vision-preview",
  code: "qwen-qwq-32b",
};

export async function groqChat(messages, options = {}) {
  const model = MODELS[options.preset] || options.model || MODELS.fast;
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function groqEmbed(input) {
  // Groq doesn't have embeddings yet, but we keep the interface ready
  throw new Error("Embeddings not yet available on Groq — use local model or fallback");
}

export { MODELS as GROQ_MODELS };
