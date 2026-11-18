(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.E7Calc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STAGES = [0, 3, 6, 9, 12, 15];

  const STATS = [
    { key: "atk", label: "ATK", suffix: "%", kind: "pct" },
    { key: "hp", label: "HP", suffix: "%", kind: "pct" },
    { key: "def", label: "DEF", suffix: "%", kind: "pct" },
    { key: "spd", label: "SPD", suffix: "", kind: "spd" },
    { key: "cc", label: "CRIT CHANCE", suffix: "%", kind: "cc" },
    { key: "cd", label: "CRIT DAMAGE", suffix: "%", kind: "cd" },
    { key: "eff", label: "EFFECTIVENESS", suffix: "%", kind: "pct" },
    { key: "er", label: "EFFECT RESIST", suffix: "%", kind: "pct" },
  ];

  const L85_WEIGHTS = Object.freeze({
    atk: 1,
    hp: 1,
    def: 1,
    eff: 1,
    er: 1,
    spd: 2,
    cc: 1.6,
    cd: 8 / 7,
  });

  const L88_WEIGHTS = Object.freeze({
    atk: 10 / 9,
    hp: 10 / 9,
    def: 10 / 9,
    eff: 10 / 9,
    er: 10 / 9,
    spd: 2,
    cc: 10 / 6,
    cd: 10 / 8,
  });

  const PROFILES = Object.freeze({
    epic85: Object.freeze({
      key: "epic85",
      level: 85,
      rarity: "Epic",
      label: "Lv 85 Epic",
      baseRolls: 4,
      perRoll: 6.08,
      maxRollPoints: 8,
      system: "8-point",
      weights: L85_WEIGHTS,
    }),
    heroic85: Object.freeze({
      key: "heroic85",
      level: 85,
      rarity: "Heroic",
      label: "Lv 85 Heroic",
      baseRolls: 3,
      perRoll: 7.04,
      maxRollPoints: 8,
      system: "8-system",
      weights: L85_WEIGHTS,
    }),
    epic88: Object.freeze({
      key: "epic88",
      level: 88,
      rarity: "Epic",
      label: "Lv 88 Epic",
      baseRolls: 4,
      perRoll: 8.04,
      maxRollPoints: 10,
      system: "10-point",
      weights: L88_WEIGHTS,
    }),
  });

  function getProfile(level, rarity) {
    const lv = Number(level);
    const rar = String(rarity || "").toLowerCase();
    if (lv === 88) return rar === "epic" ? PROFILES.epic88 : null;
    if (lv === 85) return rar === "heroic" ? PROFILES.heroic85 : PROFILES.epic85;
    return null;
  }

  function rollsAt(profile, stage) {
    return profile.baseRolls + Number(stage) / 3;
  }

  function totalRolls(profile) {
    return rollsAt(profile, 15);
  }

  function parseValue(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function computeScore(profile, stats) {
    const rows = STATS.map(function (stat) {
      const value = parseValue(stats ? stats[stat.key] : 0);
      const weight = profile.weights[stat.key];
      const points = value * weight;
      return {
        key: stat.key,
        label: stat.label,
        suffix: stat.suffix,
        kind: stat.kind,
        value: value,
        weight: weight,
        points: points,
      };
    });
    const total = rows.reduce(function (sum, row) {
      return sum + row.points;
    }, 0);
    return { total: total, rows: rows };
  }

  function buildBenchmarkTable(profile) {
    return STAGES.map(function (stage) {
      const rolls = rollsAt(profile, stage);
      const benchmark = rolls * profile.perRoll;
      return {
        stage: stage,
        rolls: rolls,
        benchmark: benchmark,
        formula: rolls + " × " + profile.perRoll.toFixed(2),
      };
    });
  }

  function buildReachability(profile, currentStage, currentScore, hasStats) {
    const currentRolls = rollsAt(profile, currentStage);
    const maxRollPoints = profile.maxRollPoints;

    return STAGES.map(function (stage) {
      const rolls = rollsAt(profile, stage);
      const benchmark = rolls * profile.perRoll;

      if (stage < currentStage) {
        return {
          stage: stage,
          rolls: rolls,
          benchmark: benchmark,
          bestCase: null,
          remaining: 0,
          state: "past",
          reachable: null,
        };
      }

      const remaining = rolls - currentRolls;
      const bestCase = currentScore + remaining * maxRollPoints;

      if (!hasStats) {
        return {
          stage: stage,
          rolls: rolls,
          benchmark: benchmark,
          bestCase: null,
          remaining: remaining,
          state: "empty",
          reachable: null,
        };
      }

      const reachable = bestCase + 1e-9 >= benchmark;
      const state =
        stage === currentStage
          ? reachable
            ? "met"
            : "below"
          : reachable
          ? "reachable"
          : "unreachable";

      return {
        stage: stage,
        rolls: rolls,
        benchmark: benchmark,
        bestCase: bestCase,
        remaining: remaining,
        state: state,
        reachable: reachable,
      };
    });
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function fmt(value, digits) {
    const d = typeof digits === "number" ? digits : 2;
    return Number(value).toFixed(d);
  }

  function weightLabel(profile, key) {
    const w = profile.weights[key];
    return "×" + w.toFixed(3);
  }

  function formatStage(stage) {
    return "+" + Number(stage);
  }

  return {
    STAGES: STAGES,
    STATS: STATS,
    PROFILES: PROFILES,
    getProfile: getProfile,
    rollsAt: rollsAt,
    totalRolls: totalRolls,
    parseValue: parseValue,
    computeScore: computeScore,
    buildBenchmarkTable: buildBenchmarkTable,
    buildReachability: buildReachability,
    round2: round2,
    fmt: fmt,
    weightLabel: weightLabel,
    formatStage: formatStage,
  };
});
