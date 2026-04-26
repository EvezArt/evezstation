// middleware.js — Error boundary + Vercel compatibility (ESM)
// Import: import { safe, errorBoundary } from './middleware.js';

export const safe = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    console.error('[EVEZ ERROR]', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        code: err?.code || 'UNKNOWN',
        ts: Date.now()
      });
    }
  }
};

export const errorBoundary = (err, req, res, next) => {
  console.error('[EVEZ UNHANDLED]', err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({
      error: err?.message || 'Unhandled error',
      code: err?.code || 'UNHANDLED',
      ts: Date.now()
    });
  }
};
