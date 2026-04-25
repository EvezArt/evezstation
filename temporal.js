/**
 * TemporalQ — Quantum-Fluent Task Engine
 * Priority-based async job queue with dependency DAGs, dead-letter recovery,
 * retry with exponential backoff, and temporal scheduling.
 */

class TemporalTask {
  constructor(config) {
    this.id = crypto.randomUUID();
    this.name = config.name || "unnamed";
    this.fn = config.fn;
    this.input = config.input;
    this.priority = config.priority || 5; // 1=highest, 10=lowest
    this.status = "pending"; // pending | running | completed | failed | dead
    this.dependencies = config.dependencies || []; // task IDs that must complete first
    this.retries = 0;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs || 1000;
    this.timeout = config.timeout || 60000;
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.scheduledFor = config.scheduledFor || null; // future timestamp
    this.recurring = config.recurring || null; // { intervalMs, maxRuns }
    this.runCount = 0;
    this.tags = config.tags || [];
    this.metadata = config.metadata || {};
  }

  isReady(completedIds) {
    if (this.status !== "pending") return false;
    if (this.scheduledFor && Date.now() < this.scheduledFor) return false;
    return this.dependencies.every(dep => completedIds.has(dep));
  }
}

class TemporalQueue {
  constructor(config = {}) {
    this.tasks = new Map();
    this.completedIds = new Set();
    this.deadLetter = [];
    this.concurrency = config.concurrency || 5;
    this.running = 0;
    this.metrics = { submitted: 0, completed: 0, failed: 0, retried: 0, deadLettered: 0 };
    this.hooks = { onComplete: config.onComplete, onFail: config.onFail, onDead: config.onDead };
    this._processing = false;
    this._interval = null;
  }

  submit(config) {
    const task = new TemporalTask(config);
    this.tasks.set(task.id, task);
    this.metrics.submitted++;
    this._tryProcess();
    return task.id;
  }

  submitChain(configs) {
    const ids = [];
    let prevId = null;
    for (const config of configs) {
      if (prevId) config.dependencies = [...(config.dependencies || []), prevId];
      const id = this.submit(config);
      ids.push(id);
      prevId = id;
    }
    return ids;
  }

  submitDAG(nodes) {
    // nodes: [{ config, dependsOn: [index] }]
    const ids = [];
    for (let i = 0; i < nodes.length; i++) {
      const { config, dependsOn = [] } = nodes[i];
      config.dependencies = [...(config.dependencies || []), ...dependsOn.map(idx => ids[idx]).filter(Boolean)];
      ids.push(this.submit(config));
    }
    return ids;
  }

  async _tryProcess() {
    if (this._processing) return;
    this._processing = true;

    while (true) {
      if (this.running >= this.concurrency) break;

      const ready = [...this.tasks.values()]
        .filter(t => t.isReady(this.completedIds))
        .sort((a, b) => a.priority - b.priority);

      if (!ready.length) break;

      const task = ready[0];
      task.status = "running";
      task.startedAt = Date.now();
      this.running++;

      this._execute(task).catch(() => {});
    }

    this._processing = false;
  }

  async _execute(task) {
    try {
      const result = await Promise.race([
        Promise.resolve(task.fn(task.input, task)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), task.timeout))
      ]);

      task.result = result;
      task.status = "completed";
      task.completedAt = Date.now();
      task.runCount++;
      this.completedIds.add(task.id);
      this.metrics.completed++;

      if (this.hooks.onComplete) this.hooks.onComplete(task);

      // Handle recurring
      if (task.recurring && (!task.recurring.maxRuns || task.runCount < task.recurring.maxRuns)) {
        const nextRun = { ...task.metadata, name: task.name, fn: task.fn, input: task.input,
          priority: task.priority, scheduledFor: Date.now() + task.recurring.intervalMs,
          recurring: task.recurring, tags: task.tags, metadata: task.metadata };
        this.submit(nextRun);
      }
    } catch (err) {
      task.retries++;
      task.error = err.message;
      this.metrics.retried++;

      if (task.retries >= task.maxRetries) {
        task.status = "dead";
        this.deadLetter.push(task);
        this.metrics.deadLettered++;
        this.tasks.delete(task.id);
        if (this.hooks.onDead) this.hooks.onDead(task);
      } else {
        task.status = "pending";
        const backoff = task.backoffMs * Math.pow(2, task.retries - 1);
        task.scheduledFor = Date.now() + backoff;
        if (this.hooks.onFail) this.hooks.onFail(task);
      }
    } finally {
      this.running--;
      this._tryProcess();
    }
  }

  // Revive dead-letter tasks
  revive(taskId) {
    const idx = this.deadLetter.findIndex(t => t.id === taskId);
    if (idx === -1) return null;
    const task = this.deadLetter.splice(idx, 1)[0];
    task.status = "pending";
    task.retries = 0;
    task.error = null;
    this.tasks.set(task.id, task);
    this.metrics.deadLettered--;
    this._tryProcess();
    return task.id;
  }

  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === "pending") {
      task.status = "dead";
      this.tasks.delete(taskId);
      return true;
    }
    return false;
  }

  getStatus(taskId) {
    const task = this.tasks.get(taskId) || this.deadLetter.find(t => t.id === taskId);
    if (!task) return null;
    return {
      id: task.id, name: task.name, status: task.status, priority: task.priority,
      retries: task.retries, runCount: task.runCount, result: task.result?.response?.slice(0, 200),
      error: task.error, latency_ms: task.completedAt ? task.completedAt - task.startedAt : null,
      tags: task.tags
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      pending: [...this.tasks.values()].filter(t => t.status === "pending").length,
      running: this.running,
      deadLetterSize: this.deadLetter.length,
      avgLatency: this.metrics.completed > 0
        ? Math.round([...this.tasks.values()]
            .filter(t => t.completedAt)
            .reduce((s, t) => s + (t.completedAt - t.startedAt), 0) / this.metrics.completed)
        : 0
    };
  }

  // Start periodic processing for scheduled/recurring tasks
  start(intervalMs = 1000) {
    if (this._interval) return;
    this._interval = setInterval(() => this._tryProcess(), intervalMs);
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }
}

export { TemporalQueue, TemporalTask };
export default TemporalQueue;
