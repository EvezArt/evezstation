/**
 * Battlefield — Sandboxed Competitive Arena Platform
 * 
 * Core concepts:
 * - SandboxArena: isolated execution environments where agents compete
 * - FogOfWar: information asymmetry — agents only see what they've earned
 * - ProofOfWork: agents must prove capabilities before revealing them
 * - HierarchicalScoring: nested scoring for humans AND AI on same leaderboard
 * - SelfTraining: agents evolve between rounds using only their own battle data
 */

import { Claw, CLAW_PRESETS } from "./openclaw.js";
import { groqChat } from "./groq.js";

// ── Sandbox Isolation ──
class Sandbox {
  constructor(agentId) {
    this.agentId = agentId;
    this.memory = [];           // private to this agent
    this.revealedFacts = [];    // proven and visible to opponents
    this.hiddenCapabilities = new Set();
    this.proofLog = [];         // verified proofs
    this.score = { raw: 0, proven: 0, hidden: 0 };
  }

  learn(data) {
    this.memory.push({ data, timestamp: Date.now(), private: true });
  }

  // Agent attempts to prove a capability — only succeeds if evidence backs it
  async prove(claim, evidence) {
    const proof = {
      id: crypto.randomUUID(),
      claim,
      evidence: typeof evidence === "string" ? evidence : JSON.stringify(evidence),
      timestamp: Date.now(),
      verified: false
    };
    this.proofLog.push(proof);
    return proof;
  }

  reveal(proofId) {
    const proof = this.proofLog.find(p => p.id === proofId && p.verified);
    if (!proof) return null;
    this.revealedFacts.push(proof);
    this.score.proven += proof.weight || 1;
    return proof;
  }

  getVisibleState() {
    // What opponents can see about this agent
    return {
      agentId: this.agentId,
      revealedFacts: this.revealedFacts,
      provenScore: this.score.proven,
      totalProofs: this.proofLog.filter(p => p.verified).length
    };
  }

  getFullState() {
    // Only the agent itself sees this
    return {
      ...this.getVisibleState(),
      memory: this.memory,
      hiddenCapabilities: [...this.hiddenCapabilities],
      hiddenScore: this.score.hidden,
      totalScore: this.score.raw
    };
  }
}

// ── Battle Instance ──
class Battle {
  constructor(config) {
    this.id = crypto.randomUUID();
    this.name = config.name || "Unnamed Battle";
    this.type = config.type || "duel"; // duel | melee | team | siege
    this.domain = config.domain || "general"; // coding | reasoning | creative | strategy | general
    this.rounds = config.rounds || 3;
    this.currentRound = 0;
    this.combatants = new Map(); // agentId -> { claw, sandbox, isHuman }
    this.roundHistory = [];
    this.status = "preparing"; // preparing | active | judging | complete
    this.judges = [];
    this.rules = config.rules || {};
    this.startedAt = null;
    this.completedAt = null;
  }

  addCombatant(claw, config = {}) {
    const id = crypto.randomUUID();
    this.combatants.set(id, {
      claw,
      sandbox: new Sandbox(id),
      isHuman: config.isHuman || false,
      team: config.team || null,
      displayName: config.displayName || claw.name,
      type: config.isHuman ? "human" : "ai"
    });
    return id;
  }

  addHumanPlayer(name, config = {}) {
    const proxy = new Claw(name, {
      role: "human_proxy",
      systemPrompt: `You are representing human player ${name}. Process their inputs faithfully.`
    });
    return this.addCombatant(proxy, { ...config, isHuman: true, displayName: name });
  }

  async runRound(challenges) {
    if (this.status === "complete") throw new Error("Battle already complete");
    this.status = "active";
    if (!this.startedAt) this.startedAt = Date.now();
    this.currentRound++;

    const challenge = challenges[this.currentRound - 1] || challenges[0];
    const responses = new Map();

    // Each combatant responds in their sandbox (isolated, no peeking)
    const entries = [...this.combatants.entries()];
    const results = await Promise.allSettled(
      entries.map(async ([id, { claw, sandbox }]) => {
        // Fog of war: agent only sees opponents' revealed facts
        const opponentInfo = entries
          .filter(([oid]) => oid !== id)
          .map(([, c]) => c.sandbox.getVisibleState());

        const context = `Round ${this.currentRound}/${this.rounds}. Domain: ${this.domain}.\n` +
          `Opponent intel (only what they've proven): ${JSON.stringify(opponentInfo)}\n` +
          `Your private memory entries: ${sandbox.memory.length}\n` +
          `Challenge: ${challenge}`;

        const start = Date.now();
        const result = await claw.think(context);
        const latency = Date.now() - start;

        // Self-training: learn from own output
        sandbox.learn({ round: this.currentRound, challenge, response: result.response?.slice(0, 500), latency });

        return { id, result, latency };
      })
    );

    // Collect successful responses
    for (const r of results) {
      if (r.status === "fulfilled") {
        responses.set(r.value.id, r.value);
      }
    }

    // Judge the round
    const judgment = await this._judge(challenge, responses);

    // Verify proofs and update scores
    for (const [id, score] of Object.entries(judgment.scores || {})) {
      const combatant = this.combatants.get(id);
      if (combatant) {
        combatant.sandbox.score.raw += score.total || 0;
        // Auto-verify proofs for high-scoring responses
        if (score.total >= 7) {
          const proof = await combatant.sandbox.prove(
            `Round ${this.currentRound}: scored ${score.total}/10`,
            responses.get(id)?.result?.response?.slice(0, 200)
          );
          proof.verified = true;
          proof.weight = Math.ceil(score.total / 3);
          combatant.sandbox.reveal(proof.id);
        }
      }
    }

    const roundResult = {
      round: this.currentRound,
      challenge,
      responses: Object.fromEntries([...responses.entries()].map(([id, r]) => [id, {
        name: this.combatants.get(id)?.displayName,
        type: this.combatants.get(id)?.type,
        preview: r.result?.response?.slice(0, 200),
        latency_ms: r.latency
      }])),
      judgment,
      timestamp: new Date().toISOString()
    };

    this.roundHistory.push(roundResult);

    // Check if battle is complete
    if (this.currentRound >= this.rounds) {
      this.status = "complete";
      this.completedAt = Date.now();
    }

    return roundResult;
  }

  async _judge(challenge, responses) {
    const judge = new Claw("BattleJudge", {
      model: "reasoning",
      systemPrompt: `You are an impartial battle judge. Score each combatant on: accuracy (0-10), creativity (0-10), depth (0-10), speed_bonus (0-3). Return JSON: { scores: { "<id>": { accuracy, creativity, depth, speed_bonus, total, reasoning } }, roundWinner: "<id>", analysis: "..." }`
    });

    const input = {
      challenge,
      domain: this.domain,
      responses: Object.fromEntries([...responses.entries()].map(([id, r]) => [
        id, { name: this.combatants.get(id)?.displayName, type: this.combatants.get(id)?.type, response: r.result?.response?.slice(0, 1000), latency: r.latency }
      ]))
    };

    const verdict = await judge.think(JSON.stringify(input));
    try {
      return JSON.parse(verdict.response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return { scores: {}, roundWinner: null, analysis: "Judge error" };
    }
  }

  getStandings() {
    return [...this.combatants.entries()]
      .map(([id, c]) => ({
        id,
        name: c.displayName,
        type: c.type,
        team: c.team,
        totalScore: c.sandbox.score.raw,
        provenScore: c.sandbox.score.proven,
        proofsVerified: c.sandbox.proofLog.filter(p => p.verified).length,
        revealedFacts: c.sandbox.revealedFacts.length,
        memorySize: c.sandbox.memory.length
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  getResult() {
    if (this.status !== "complete") return null;
    const standings = this.getStandings();
    return {
      battleId: this.id,
      name: this.name,
      type: this.type,
      domain: this.domain,
      rounds: this.rounds,
      standings,
      champion: standings[0],
      duration_ms: this.completedAt - this.startedAt,
      roundHistory: this.roundHistory
    };
  }
}

// ── Global Leaderboard (humans + AI on same board) ──
class Leaderboard {
  constructor() {
    this.players = new Map(); // playerId -> stats
  }

  register(id, config) {
    this.players.set(id, {
      id,
      name: config.name,
      type: config.type || "ai", // "human" | "ai"
      elo: config.elo || 1200,
      tier: "bronze", // bronze | silver | gold | platinum | diamond | master | grandmaster
      stats: { battles: 0, wins: 0, losses: 0, draws: 0, roundsWon: 0, roundsLost: 0, totalScore: 0, avgScore: 0, proofCount: 0 },
      history: [],
      domains: {}, // per-domain stats
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
  }

  recordBattle(battleResult) {
    if (!battleResult?.standings) return;

    for (let i = 0; i < battleResult.standings.length; i++) {
      const entry = battleResult.standings[i];
      let player = this.players.get(entry.id);
      if (!player) {
        this.register(entry.id, { name: entry.name, type: entry.type });
        player = this.players.get(entry.id);
      }

      const won = i === 0;
      const lost = i === battleResult.standings.length - 1 && battleResult.standings.length > 1;

      player.stats.battles++;
      if (won) { player.stats.wins++; player.elo += 25; }
      else if (lost) { player.stats.losses++; player.elo = Math.max(0, player.elo - 15); }
      else { player.stats.draws++; player.elo += 5; }

      player.stats.totalScore += entry.totalScore;
      player.stats.proofCount += entry.proofsVerified || 0;
      player.stats.avgScore = player.stats.totalScore / player.stats.battles;
      player.lastActive = new Date().toISOString();

      // Domain-specific tracking
      const domain = battleResult.domain || "general";
      if (!player.domains[domain]) player.domains[domain] = { battles: 0, wins: 0, avgScore: 0, totalScore: 0 };
      player.domains[domain].battles++;
      if (won) player.domains[domain].wins++;
      player.domains[domain].totalScore += entry.totalScore;
      player.domains[domain].avgScore = player.domains[domain].totalScore / player.domains[domain].battles;

      player.history.push({ battleId: battleResult.battleId, place: i + 1, score: entry.totalScore, domain, at: new Date().toISOString() });
      if (player.history.length > 100) player.history = player.history.slice(-100);

      // Tier calculation
      player.tier = this._calcTier(player.elo);
    }
  }

  _calcTier(elo) {
    if (elo >= 2400) return "grandmaster";
    if (elo >= 2100) return "master";
    if (elo >= 1800) return "diamond";
    if (elo >= 1500) return "platinum";
    if (elo >= 1300) return "gold";
    if (elo >= 1100) return "silver";
    return "bronze";
  }

  getRankings(filters = {}) {
    let players = [...this.players.values()];
    if (filters.type) players = players.filter(p => p.type === filters.type);
    if (filters.domain) players = players.filter(p => p.domains[filters.domain]);
    if (filters.tier) players = players.filter(p => p.tier === filters.tier);
    if (filters.minBattles) players = players.filter(p => p.stats.battles >= filters.minBattles);

    const sorted = players.sort((a, b) => b.elo - a.elo);
    return sorted.map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      type: p.type,
      tier: p.tier,
      elo: p.elo,
      winRate: p.stats.battles ? `${Math.round(p.stats.wins / p.stats.battles * 100)}%` : "0%",
      battles: p.stats.battles,
      wins: p.stats.wins,
      avgScore: Math.round(p.stats.avgScore * 10) / 10,
      proofs: p.stats.proofCount,
      domains: Object.keys(p.domains)
    }));
  }

  getPlayerProfile(playerId) {
    return this.players.get(playerId) || null;
  }
}

// ── Battlefield Platform (ties everything together) ──
class BattlefieldPlatform {
  constructor() {
    this.activeBattles = new Map();
    this.completedBattles = [];
    this.leaderboard = new Leaderboard();
    this.challengeBank = {
      coding: [
        "Write a function that finds the longest palindromic substring in O(n) time",
        "Implement a lock-free concurrent queue",
        "Design a rate limiter that handles burst traffic gracefully",
        "Build a minimal reactive state management system in under 50 lines"
      ],
      reasoning: [
        "A company has 3 products. Product A costs $10 and has 60% margin. Product B costs $25 with 40% margin. Product C costs $5 with 80% margin. They sell 1000 units total. How should they allocate to maximize profit?",
        "You have 8 balls, one is heavier. You have a balance scale. Find the heavy ball in minimum weighings. Prove your solution is optimal.",
        "Design a consensus algorithm for 5 nodes where up to 2 can be Byzantine. Explain the safety and liveness guarantees."
      ],
      creative: [
        "Write a 200-word story where every sentence contradicts the previous one, yet the whole piece tells a coherent narrative",
        "Design a new color that doesn't exist. Name it, describe how it looks, and explain when humans would see it.",
        "Invent a board game that teaches quantum computing concepts to children"
      ],
      strategy: [
        "You're launching a startup against an incumbent with 90% market share and $100M funding. You have $50K. What's your 12-month plan?",
        "Design a token economy for a developer platform where usage is incentivized but spam is expensive",
        "You control a fleet of 100 autonomous drones. Design the coordination protocol for search-and-rescue in a disaster zone."
      ]
    };
  }

  createBattle(config) {
    const battle = new Battle({
      ...config,
      rules: { ...config.rules, fogOfWar: true, proofRequired: true }
    });
    this.activeBattles.set(battle.id, battle);
    return battle;
  }

  async quickMatch(domain = "general", playerCount = 2) {
    const presets = ["coder", "analyst", "writer", "researcher"];
    const challenges = this.challengeBank[domain] || this.challengeBank.general || this.challengeBank.reasoning;
    const battle = this.createBattle({ name: `Quick ${domain} match`, type: playerCount > 2 ? "melee" : "duel", domain, rounds: 3 });

    for (let i = 0; i < playerCount; i++) {
      const preset = presets[i % presets.length];
      const factory = CLAW_PRESETS[preset];
      battle.addCombatant(factory ? factory(`${preset}_${i}`) : new Claw(`Agent_${i}`));
    }

    // Run all rounds
    for (let r = 0; r < battle.rounds; r++) {
      await battle.runRound(challenges);
    }

    const result = battle.getResult();
    this.leaderboard.recordBattle(result);
    this.activeBattles.delete(battle.id);
    this.completedBattles.push(result);
    if (this.completedBattles.length > 500) this.completedBattles = this.completedBattles.slice(-500);

    return result;
  }

  getStats() {
    return {
      activeBattles: this.activeBattles.size,
      completedBattles: this.completedBattles.length,
      registeredPlayers: this.leaderboard.players.size,
      domains: Object.keys(this.challengeBank),
      topPlayers: this.leaderboard.getRankings({ minBattles: 1 }).slice(0, 10)
    };
  }
}

export { Sandbox, Battle, Leaderboard, BattlefieldPlatform };
export default BattlefieldPlatform;
