// inference-loop.js
// Drop into evezstation — closes the self-training loop.
// Every inference call becomes a new training pair.

'use strict';

const MIN_QUALITY_TO_LOG = 0.5;

/**
 * Score inference output quality.
 * Simple heuristics — expand as you learn what good looks like.
 */
const scoreInferenceQuality = ({ input, output, latencyMs }) => {
  if (!output || !output.content) return 0;

  const content = typeof output.content === 'string'
    ? output.content
    : JSON.stringify(output.content);

  // penalize empty or error responses
  if (content.length < 10) return 0;
  if (/error|failed|undefined/i.test(content) && content.length < 50) return 0.2;

  // base score from output length (proxy for completeness)
  const lengthScore = Math.min(content.length / 500, 0.5);

  // latency penalty — slow inference = probably struggling
  const latencyPenalty = Math.min((latencyMs || 0) / 10000, 0.3);

  // input quality signal
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  const inputScore = Math.min(inputStr.length / 200, 0.3);

  return Math.max(0, Math.min(1, lengthScore + inputScore - latencyPenalty));
};

/**
 * Middleware factory.
 * Usage:
 *   const { makeInferenceLogger } = require('./inference-loop');
 *   const logInference = makeInferenceLogger(supabase);
 *   app.post('/api/inference/:model_id', logInference, yourHandler);
 *
 * Or wrap your existing handler:
 *   app.post('/api/inference/:model_id', async (req, res) => {
 *     const start = Date.now();
 *     ... your existing inference logic ...
 *     const result = { content: responseText };
 *     await logInferencePair(supabase, {
 *       modelId: req.params.model_id,
 *       input: req.body,
 *       output: result,
 *       latencyMs: Date.now() - start
 *     });
 *     res.json(result);
 *   });
 */

const logInferencePair = async (supabase, { modelId, input, output, latencyMs }) => {
  if (!supabase) return;

  const quality = scoreInferenceQuality({ input, output, latencyMs });

  if (quality < MIN_QUALITY_TO_LOG) {
    console.log(`[EVEZ LOOP] Skipped pair — quality ${quality.toFixed(2)} below floor`);
    return;
  }

  try {
    const { error } = await supabase.from('training_pairs').insert({
      input:         typeof input === 'string' ? input : JSON.stringify(input),
      output:        typeof output === 'string' ? output : JSON.stringify(output),
      quality_score: quality,
      source:        'inference_loop',
      model_id:      modelId,
      created_at:    new Date().toISOString()
    });

    if (error) throw error;
    console.log(`[EVEZ LOOP] Logged pair · model=${modelId} · quality=${quality.toFixed(2)}`);
  } catch (err) {
    // NEVER crash inference over a logging failure
    console.warn('[EVEZ LOOP] Failed to log training pair:', err?.message);
  }
};

/**
 * Express middleware wrapper.
 * Intercepts res.json to capture the response after it's sent.
 */
const makeInferenceLogger = (supabase) => (req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // fire-and-forget — don't await
    logInferencePair(supabase, {
      modelId:   req.params?.model_id || 'unknown',
      input:     req.body,
      output:    body,
      latencyMs: Date.now() - start
    }).catch(() => {});

    return originalJson(body);
  };

  next();
};

module.exports = { makeInferenceLogger, logInferencePair, scoreInferenceQuality };
