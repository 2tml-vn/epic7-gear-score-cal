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

  // Single-roll ranges from the in-game reference table, keyed by gear profile and stat kind.
  // SPD is the one range that differs between Lv 85 Epic and Heroic gear.
  const L85_COMMON_RANGES = Object.freeze({
    pct: Object.freeze({ min: 4, max: 8 }),
    cc: Object.freeze({ min: 3, max: 5 }),
    cd: Object.freeze({ min: 4, max: 7 }),
  });

  const ROLL_RANGES = Object.freeze({
    epic85: Object.freeze(
      Object.assign({}, L85_COMMON_RANGES, {
        spd: Object.freeze({ min: 2, max: 5 }), // 5 is rare
      })
    ),
    heroic85: Object.freeze(
      Object.assign({}, L85_COMMON_RANGES, {
        spd: Object.freeze({ min: 1, max: 4 }), // 1 is rare
      })
    ),
    epic88: Object.freeze({
      pct: Object.freeze({ min: 5, max: 9 }),
      spd: Object.freeze({ min: 3, max: 5 }),
      cc: Object.freeze({ min: 3, max: 6 }),
      cd: Object.freeze({ min: 4, max: 8 }),
    }),
  });

  // Greater substat modification gem, base-roll values for gear item level 88 or lower.
  // Crit Chance is deliberately absent: its mod value is 1 lower than a normal roll.
  const GREATER_MOD_MAX = Object.freeze({
    pct: 8,
    spd: 4,
    cd: 7,
  });

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

  function rollOptions(profile, statKey) {
    const stat = STATS.find(function (s) {
      return s.key === statKey;
    });
    if (!stat || !profile) return [];
    const byKind = ROLL_RANGES[profile.key];
    const range = byKind && byKind[stat.kind];
    if (!range) return [];
    const list = [];
    for (let value = range.min; value <= range.max; value += 1) list.push(value);
    return list;
  }

  // Each entry in a stat's array is one enhancement roll that landed there.
  function effectiveStats(stats, plusThree) {
    const out = {};
    STATS.forEach(function (stat) {
      const base = parseValue(stats ? stats[stat.key] : 0);
      const rolls = plusThree && Array.isArray(plusThree[stat.key]) ? plusThree[stat.key] : [];
      const added = rolls.reduce(function (sum, value) {
        return sum + parseValue(value);
      }, 0);
      out[stat.key] = base + added;
    });
    return out;
  }

  function countPlusThree(plusThree) {
    return STATS.reduce(function (sum, stat) {
      const rolls = plusThree && Array.isArray(plusThree[stat.key]) ? plusThree[stat.key] : [];
      return sum + rolls.length;
    }, 0);
  }

  function effectiveStage(stage, count) {
    return Math.min(15, Number(stage) + 3 * Number(count));
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

  // A Greater gem can only be used on a substat that still has its single base
  // roll. Roll counts come from the +3 rolls already added to each substat, so
  // a base roll that has received a roll is no longer a candidate. Remaining
  // rolls in the projection are placed on the other existing substats so the
  // chosen source stays at one base roll.
  function bestGreaterModGain(mode, profile, stats, plusThree, remainingRolls) {
    if (!profile || profile.level !== 85 || !mode || mode === "off") return null;
    const values = stats || {};
    const added = plusThree || {};

    const existing = STATS.filter(function (stat) {
      return parseValue(values[stat.key]) > 0;
    });
    if (!existing.length) return null;

    const eligible = existing.filter(function (stat) {
      const rolls = Array.isArray(added[stat.key]) ? added[stat.key] : [];
      return rolls.length === 0;
    });
    if (!eligible.length) return null;

    // The gem source has to stay at 1 roll, so every remaining roll needs a
    // different existing substat to land on.
    if (Number(remainingRolls) > 0 && existing.length < 2) return null;

    // Targets must not already be on the gear (same stat is always allowed).
    const emptyStats = STATS.filter(function (stat) {
      return stat.key !== "cc" && parseValue(values[stat.key]) === 0;
    });

    let best = null;
    eligible.forEach(function (source) {
      const base = parseValue(values[source.key]);
      const sourcePoints = base * profile.weights[source.key];
      const targets = mode === "any" ? [source].concat(emptyStats) : [source];

      targets.forEach(function (target) {
        if (target.key === "cc") return;
        const maxValue = GREATER_MOD_MAX[target.kind];
        if (!maxValue) return;
        const newValue =
          target.key === source.key ? Math.max(base, maxValue) : maxValue;
        const gain = newValue * profile.weights[target.key] - sourcePoints;
        if (gain <= 1e-9) return;
        if (best && gain <= best.points + 1e-9) return;
        best = {
          points: gain,
          sourceKey: source.key,
          sourceLabel: source.label + source.suffix,
          targetKey: target.key,
          targetLabel: target.label + target.suffix,
          targetValue: newValue,
        };
      });
    });
    return best;
  }

  function buildReachability(profile, currentStage, currentScore, hasStats, modGem) {
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
          rawBestCase: null,
          remaining: 0,
          state: "past",
          reachable: null,
          gemPoints: 0,
          gemMode: modGem ? modGem.mode : "off",
        };
      }

      const remaining = rolls - currentRolls;
      const gem =
        hasStats && modGem
          ? bestGreaterModGain(
              modGem.mode,
              profile,
              modGem.stats,
              modGem.plusThree,
              remaining
            )
          : null;
      const gemPoints = gem ? gem.points : 0;
      const rawBestCase = currentScore + remaining * maxRollPoints;
      const bestCase = rawBestCase + gemPoints;

      if (!hasStats) {
        return {
          stage: stage,
          rolls: rolls,
          benchmark: benchmark,
          bestCase: null,
          rawBestCase: null,
          remaining: remaining,
          state: "empty",
          reachable: null,
          gemPoints: 0,
          gemMode: modGem ? modGem.mode : "off",
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
        rawBestCase: rawBestCase,
        remaining: remaining,
        state: state,
        reachable: reachable,
        gemPoints: gemPoints,
        gemMode: modGem ? modGem.mode : "off",
        gemSourceLabel: gem ? gem.sourceLabel : null,
        gemTargetLabel: gem ? gem.targetLabel : null,
        gemTargetValue: gem ? gem.targetValue : null,
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
    ROLL_RANGES: ROLL_RANGES,
    GREATER_MOD_MAX: GREATER_MOD_MAX,
    bestGreaterModGain: bestGreaterModGain,
    getProfile: getProfile,
    rollsAt: rollsAt,
    totalRolls: totalRolls,
    parseValue: parseValue,
    rollOptions: rollOptions,
    effectiveStats: effectiveStats,
    countPlusThree: countPlusThree,
    effectiveStage: effectiveStage,
    computeScore: computeScore,
    buildBenchmarkTable: buildBenchmarkTable,
    buildReachability: buildReachability,
    round2: round2,
    fmt: fmt,
    weightLabel: weightLabel,
    formatStage: formatStage,
  };
});
