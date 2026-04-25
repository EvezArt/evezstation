/**
 * SwarmNet — Distributed Agent Mesh Intelligence
 * Agents discover each other, form teams, route tasks, and scale horizontally.
 * Implements: gossip protocol, task sharding, consensus, load balancing.
 */

import { Claw, CLAW_PRESETS } from "./openclaw.js";
import { groqChat } from "./groq.js";

class SwarmNode {
  constructor(claw, config = {}) {
    this.id = crypto.randomUUID();
    this.claw = claw;
    this.peers = new Map();
    this.taskQueue = [];
    this.results = new Map();
    this.load = 0;
    this.maxLoad = config.maxLoad || 10;
    this.specialties = config.specialties || [claw.role];
    this.health = { alive: true, lastPing: Date.now(), uptime: 0, tasksCompleted: 0 };
  }

  canAccept() { return this.health.alive && this.load < this.maxLoad; }

  async process(task) {
    this.load++;
    const start = Date.now();
    try {
      const result = await this.claw.think(task.input, { preset: task.model });
      this.health.tasksCompleted++;
      this.results.set(task.id, { ...result, latency_ms: Date.now() - start, node: this.id });
      return this.results.get(task.id);
    } finally { this.load--; }
  }

  ping() {
    this.health.lastPing = Date.now();
    this.health.uptime = Date.now() - (this.health.startedAt || Date.now());
    return { id: this.id, name: this.claw.name, load: this.load, maxLoad: this.maxLoad, specialties: this.specialties, alive: this.health.alive };
  }
}

class Swarm {
  constructor(config = {}) {
    this.id = crypto.randomUUID();
    this.nodes = new Map();
    this.taskLog = [];
    this.consensusThreshold = config.consensusThreshold || 0.6;
    this.redundancy = config.redundancy || 1;
    this.strategy = config.strategy || "least_loaded"; // least_loaded | round_robin | specialty | broadcast
  }

  addNode(claw, config = {}) {
    const node = new SwarmNode(claw, config);
    this.nodes.set(node.id, node);
    // Gossip: announce to existing peers
    for (const [id, peer] of this.nodes) {
      if (id !== node.id) {
        peer.peers.set(node.id, node);
        node.peers.set(id, peer);
      }
    }
    return node;
  }

  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.health.alive = false;
      for (const peer of this.nodes.values()) peer.peers.delete(nodeId);
      this.nodes.delete(nodeId);
    }
  }

  _selectNodes(task) {
    const alive = [...this.nodes.values()].filter(n => n.canAccept());
    if (!alive.length) throw new Error("No available nodes in swarm");

    switch (this.strategy) {
      case "specialty": {
        const matched = alive.filter(n => n.specialties.some(s => task.specialty?.includes(s) || s === "general"));
        return matched.length ? matched.slice(0, this.redundancy) : alive.slice(0, this.redundancy);
      }
      case "broadcast":
        return alive;
      case "round_robin": {
        const sorted = alive.sort((a, b) => a.health.tasksCompleted - b.health.tasksCompleted);
        return sorted.slice(0, this.redundancy);
      }
      case "least_loaded":
      default: {
        const sorted = alive.sort((a, b) => (a.load / a.maxLoad) - (b.load / b.maxLoad));
        return sorted.slice(0, this.redundancy);
      }
    }
  }

  async submit(input, options = {}) {
    const task = {
      id: crypto.randomUUID(),
      input,
      specialty: options.specialty,
      model: options.model,
      priority: options.priority || 5,
      submitted: Date.now()
    };

    const nodes = this._selectNodes(task);
    const results = await Promise.allSettled(nodes.map(n => n.process(task)));
    const successes = results.filter(r => r.status === "fulfilled").map(r => r.value);

    if (!successes.length) throw new Error("All nodes failed for task");

    // If multiple results, find consensus
    let finalResult;
    if (successes.length === 1) {
      finalResult = successes[0];
    } else {
      finalResult = await this._consensus(successes, input);
    }

    this.taskLog.push({ ...task, result: finalResult, nodesUsed: nodes.length, completed: Date.now() });
    return finalResult;
  }

  async _consensus(results, originalInput) {
    // Use a reasoning model to synthesize multiple agent outputs
    const synthesizer = new Claw("Synthesizer", { model: "reasoning" });
    const synthesis = await synthesizer.think(
      `Multiple agents produced these responses to: "${originalInput}"\n\n` +
      results.map((r, i) => `Agent ${i + 1} (${r.claw}): ${r.response?.slice(0, 500)}`).join("\n\n") +
      "\n\nSynthesize the best answer, combining strengths and correcting weaknesses."
    );
    return { ...synthesis, consensus: true, sourceCount: results.length };
  }

  async shard(bigTask, shardCount = null) {
    const nodeCount = this.nodes.size;
    const count = shardCount || Math.min(nodeCount, 5);

    // Use AI to decompose the task
    const planner = new Claw("TaskPlanner", { model: "reasoning" });
    const plan = await planner.think(
      `Decompose this task into exactly ${count} independent subtasks that can be processed in parallel. ` +
      `Return JSON array of strings, each being a clear subtask.\n\nTask: ${bigTask}`
    );

    let subtasks;
    try {
      subtasks = JSON.parse(plan.response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      subtasks = [bigTask]; // fallback to no sharding
    }

    // Execute shards in parallel across the swarm
    const shardResults = await Promise.allSettled(
      subtasks.map(sub => this.submit(sub))
    );

    const completed = shardResults.filter(r => r.status === "fulfilled").map(r => r.value);

    // Synthesize shard results
    const assembler = new Claw("Assembler", { model: "reasoning" });
    const final = await assembler.think(
      `The original task was: "${bigTask}"\n\nThese subtask results were produced:\n` +
      completed.map((r, i) => `Shard ${i + 1}: ${r.response?.slice(0, 400)}`).join("\n") +
      "\n\nAssemble these into a comprehensive final result."
    );

    return {
      task: bigTask,
      shards: subtasks.length,
      completedShards: completed.length,
      synthesis: final.response,
      latency_ms: completed.reduce((sum, r) => sum + (r.latency_ms || 0), 0)
    };
  }

  getTopology() {
    return {
      id: this.id,
      nodeCount: this.nodes.size,
      strategy: this.strategy,
      totalLoad: [...this.nodes.values()].reduce((s, n) => s + n.load, 0),
      totalCapacity: [...this.nodes.values()].reduce((s, n) => s + n.maxLoad, 0),
      nodes: [...this.nodes.values()].map(n => n.ping()),
      tasksProcessed: this.taskLog.length
    };
  }

  getMetrics() {
    const tasks = this.taskLog;
    if (!tasks.length) return { totalTasks: 0 };
    const latencies = tasks.map(t => t.result?.latency_ms || 0).filter(Boolean);
    return {
      totalTasks: tasks.length,
      avgLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p99Latency: latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)] || 0,
      throughput: tasks.length / ((Date.now() - (tasks[0]?.submitted || Date.now())) / 1000 || 1),
      nodeUtilization: [...this.nodes.values()].map(n => ({
        name: n.claw.name, load: n.load, maxLoad: n.maxLoad,
        completed: n.health.tasksCompleted, utilization: `${Math.round(n.load / n.maxLoad * 100)}%`
      }))
    };
  }
}

// Quick-start factory
function createSwarm(presetNames, config = {}) {
  const swarm = new Swarm(config);
  for (const name of presetNames) {
    const factory = CLAW_PRESETS[name];
    if (factory) swarm.addNode(factory(), { specialties: [name] });
    else swarm.addNode(new Claw(name), { specialties: ["general"] });
  }
  return swarm;
}

export { Swarm, SwarmNode, createSwarm };
export default Swarm;
