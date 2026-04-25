/**
 * AutoClaw — Competitive Arena Engine
 * Runs OpenClaw agents against each other, scores them, evolves winners.
 * Supports 1v1 duels, team battles, tournament brackets, and continuous evolution.
 */

import { Claw, CLAW_PRESETS } from "./openclaw.js";
import { groqChat } from "./groq.js";

class Arena {
  constructor(config = {}) {
    this.id = crypto.randomUUID();
    this.rounds = [];
    this.leaderboard = new Map();
    this.judges = config.judges || [new Claw("JudgeClaw", {
      role: "judge", model: "reasoning",
      systemPrompt: "You are an impartial judge. Score AI responses on: accuracy (0-10), creativity (0-10), efficiency (0-10), depth (0-10). Return JSON: {scores: {accuracy, creativity, efficiency, depth}, total: number, winner: 'A'|'B'|'tie', reasoning: string}"
    })];
    this.evolutionRate = config.evolutionRate || 0.15;
    this.maxGenerations = config.maxGenerations || 100;
  }

  async duel(clawA, clawB, challenge, context = {}) {
    const start = Date.now();
    const [resultA, resultB] = await Promise.all([
      clawA.think(challenge).catch(e => ({ response: `[ERROR] ${e.message}`, error: true })),
      clawB.think(challenge).catch(e => ({ response: `[ERROR] ${e.message}`, error: true }))
    ]);

    // Multi-judge scoring for fairness
    const verdicts = await Promise.all(this.judges.map(judge =>
      judge.think(JSON.stringify({
        challenge,
        responseA: resultA.response?.slice(0, 2000),
        responseB: resultB.response?.slice(0, 2000),
        criteria: context.criteria || "general quality"
      })).catch(() => ({ response: '{"scores":{},"total":0,"winner":"tie","reasoning":"judge error"}' }))
    ));

    let scoresA = 0, scoresB = 0, judgments = [];
    for (const v of verdicts) {
      try {
        const parsed = JSON.parse(v.response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
        judgments.push(parsed);
        if (parsed.winner === "A") scoresA++;
        else if (parsed.winner === "B") scoresB++;
      } catch { judgments.push({ winner: "tie", reasoning: "parse error" }); }
    }

    const winner = scoresA > scoresB ? "A" : scoresB > scoresA ? "B" : "tie";
    const round = {
      id: crypto.randomUUID(),
      challenge,
      clawA: { name: clawA.name, response: resultA.response?.slice(0, 500) },
      clawB: { name: clawB.name, response: resultB.response?.slice(0, 500) },
      judgments, winner, latency_ms: Date.now() - start,
      timestamp: new Date().toISOString()
    };

    this.rounds.push(round);
    this._updateLeaderboard(clawA.name, winner === "A");
    this._updateLeaderboard(clawB.name, winner === "B");

    return round;
  }

  async tournament(claws, challenges, config = {}) {
    const results = { rounds: [], bracket: [], champion: null, stats: {} };
    let participants = [...claws];

    for (let round = 0; participants.length > 1; round++) {
      const roundResults = [];
      const nextRound = [];

      for (let i = 0; i < participants.length; i += 2) {
        if (i + 1 >= participants.length) {
          nextRound.push(participants[i]); // bye
          continue;
        }
        const challenge = challenges[round % challenges.length];
        const duel = await this.duel(participants[i], participants[i + 1], challenge);
        roundResults.push(duel);
        nextRound.push(duel.winner === "A" ? participants[i] : participants[i + 1]);
      }

      results.bracket.push({ round, matchups: roundResults.length, results: roundResults });
      participants = nextRound;
    }

    results.champion = participants[0]?.name || null;
    results.stats = Object.fromEntries(this.leaderboard);
    return results;
  }

  async evolve(claws, challenges, generations = 5) {
    const history = [];
    let population = [...claws];

    for (let gen = 0; gen < Math.min(generations, this.maxGenerations); gen++) {
      // Run tournament
      const tournament = await this.tournament(population, challenges);
      history.push({ generation: gen, champion: tournament.champion, stats: tournament.stats });

      // Evolve: mutate losers based on winner patterns
      const champion = population.find(c => c.name === tournament.champion);
      if (!champion) break;

      population = population.map(claw => {
        if (claw.name === champion.name) return claw;
        if (Math.random() < this.evolutionRate) {
          // Cross-pollinate: inject some of champion's memory into others
          const donated = champion.memory.slice(-4);
          claw.memory.push(...donated);
          claw.systemPrompt += "\nLearn from top performers. Be more precise and creative.";
        }
        return claw;
      });
    }

    return { generations: history, finalChampion: history[history.length - 1]?.champion };
  }

  _updateLeaderboard(name, won) {
    const stats = this.leaderboard.get(name) || { wins: 0, losses: 0, draws: 0, elo: 1200 };
    if (won === true) { stats.wins++; stats.elo += 15; }
    else if (won === false) { stats.losses++; stats.elo -= 10; }
    else { stats.draws++; }
    this.leaderboard.set(name, stats);
  }

  getLeaderboard() {
    return [...this.leaderboard.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.elo - a.elo);
  }
}

class TeamBattle {
  constructor(arena) {
    this.arena = arena || new Arena();
  }

  async battle(teamA, teamB, mission) {
    const start = Date.now();

    // Each team works collaboratively on the mission
    const conductorA = new Claw("TeamA_Lead", { model: "reasoning" });
    const conductorB = new Claw("TeamB_Lead", { model: "reasoning" });

    const [resultA, resultB] = await Promise.all([
      conductorA.compose(teamA, mission),
      conductorB.compose(teamB, mission)
    ]);

    // Judge the team outputs
    const judge = this.arena.judges[0];
    const verdict = await judge.think(JSON.stringify({
      mission,
      teamA_output: resultA.synthesis?.slice(0, 2000),
      teamB_output: resultB.synthesis?.slice(0, 2000),
      criteria: "completeness, quality, collaboration effectiveness"
    }));

    let parsed;
    try {
      parsed = JSON.parse(verdict.response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch { parsed = { winner: "tie", reasoning: "judge parse error" }; }

    return {
      mission, winner: parsed.winner,
      teamA: { members: teamA.map(c => c.name), output: resultA.synthesis?.slice(0, 500), parts: resultA.parts?.length },
      teamB: { members: teamB.map(c => c.name), output: resultB.synthesis?.slice(0, 500), parts: resultB.parts?.length },
      judgment: parsed, latency_ms: Date.now() - start
    };
  }
}

export { Arena, TeamBattle };
export default Arena;
