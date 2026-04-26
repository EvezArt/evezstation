// inference-loop.js
// Closes the self-training loop.
// Every inference call becomes a new training pair.

const MIN_QUALITY_TO_LOG = 0.5;

export const scoreInferenceQuality = ({ input, output, latencyMs }) => {
  if (!output || !output.content) return 0;

  const content = typeof output.content === 'string'
    ? output.content
    : JSON.stringify(output.content);

  if (content.length < 10) return 0;
  if (/error|failed|undefined/i.test(content) && content.length < 50) return 0.2;

  const lengthScore = Math.min(content.length / 500, 0.5);
  const latencyPenalty = Math.min((latencyMs || 0) / 10000, 0.3);
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  const inputScore = Math.min(inputStr.length / 200, 0.3);

  return Math.max(0, Math.min(1, lengthScore + inputScore - latencyPenalty));
};

export const logInferencePair = async (supabase, { modelId, input, output, latencyMs }) => {
  if (!supabase) return;

  const quality = scoreInferenceQuality({ input, output, latencyMs });

  if (quality < MIN_QUALITY_TO_LOG) {
    console.log(`[EVEZ LOOP] Skipped pair — quality ${quality.toFixed(2)} below floor`);
    return;
  }

  try {
    const { error } = await supabase.schema('evezstation').from('training_pairs').insert({
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
    console.warn('[EVEZ LOOP] Failed to log training pair:', err?.message);
  }
};

export const makeInferenceLogger = (supabase) => (req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
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
