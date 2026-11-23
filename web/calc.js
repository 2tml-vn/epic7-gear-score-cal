(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.E7Calc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STAGES = [0, 3, 6, 9, 12, 15];

  // A gear has four base substat slots. Only ATK, HP and DEF have flat
  // variants, and each can appear at most once.
  const MAX_BASE_SUBSTATS = 4;
  const MAX_FLAT_STATS = 3;

  const STATS = [
    { key: "atk", label: "ATK", suffix: "%", kind: "pct" },
    { key: "hp", label: "HP", suffix: "%", kind: "pct" },
    { key: "def", label: "DEF", suffix: "%", kind: "pct" },
    { key: "eff", label: "EFFECTIVENESS", suffix: "%", kind: "pct" },
    { key: "er", label: "EFFECT RESIST", suffix: "%", kind: "pct" },
    { key: "spd", label: "SPD", suffix: "", kind: "spd" },
    { key: "cc", label: "CRIT CHANCE", suffix: "%", kind: "cc" },
    { key: "cd", label: "CRIT DAMAGE", suffix: "%", kind: "cd" },
  ];

  // Single-roll ranges from the in-game reference table, keyed by gear profile and stat kind.
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

  function getProfile(level) {
    const lv = Number(level);
    if (lv === 88) return PROFILES.epic88;
    if (lv === 85) return PROFILES.epic85;
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

  function computeScore(profile, stats, flatCount, perRoll) {
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
    const rawTotal = rows.reduce(function (sum, row) {
      return sum + row.points;
    }, 0);
    const penalty = resolveFlatPenalty(profile, flatCount, perRoll);
    return {
      total: rawTotal - penalty,
      rawTotal: rawTotal,
      penalty: penalty,
      rows: rows,
    };
  }

  // The target per roll is user-adjustable; an invalid override falls back to
  // the profile's reference value. PROFILES is frozen and never mutated.
  function resolvePerRoll(profile, perRoll) {
    const n = Number(perRoll);
    return Number.isFinite(n) && n > 0 ? n : profile.perRoll;
  }

  function normalizeFlatCount(flatCount) {
    const n = Math.floor(Number(flatCount));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(MAX_FLAT_STATS, n));
  }

  // Flat ATK / HP / DEF only exist on Lv 85 Epic in this app. Their numeric
  // value is irrelevant; what matters is how many are on the gear. Each one
  // costs one target-per-roll worth of points.
  function resolveFlatPenalty(profile, flatCount, perRoll) {
    if (!profile || profile.level !== 85) return 0;
    return resolvePerRoll(profile, perRoll) * normalizeFlatCount(flatCount);
  }

  // Display-only validation: every flat stat and every base-valued percentage
  // substat takes one of the gear's four substat slots. Scores are still
  // computed when the count is over the limit.
  function substatOverflow(flatCount, stats) {
    const flats = normalizeFlatCount(flatCount);
    const baseCount = STATS.filter(function (stat) {
      return parseValue(stats ? stats[stat.key] : 0) > 0;
    }).length;
    const total = flats + baseCount;
    return total > MAX_BASE_SUBSTATS
      ? { flats: flats, base: baseCount, total: total, max: MAX_BASE_SUBSTATS }
      : null;
  }

  function buildBenchmarkTable(profile, perRoll) {
    const target = resolvePerRoll(profile, perRoll);
    return STAGES.map(function (stage) {
      const rolls = rollsAt(profile, stage);
      const benchmark = rolls * target;
      return {
        stage: stage,
        rolls: rolls,
        benchmark: benchmark,
        formula: rolls + " × " + target.toFixed(2),
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
          sourceValue: base,
          sourcePoints: sourcePoints,
          targetKey: target.key,
          targetLabel: target.label + target.suffix,
          targetValue: newValue,
          targetPoints: newValue * profile.weights[target.key],
        };
      });
    });
    return best;
  }

  function buildReachability(profile, currentStage, currentScore, hasStats, modGem, perRoll, flatCount) {
    const currentRolls = rollsAt(profile, currentStage);
    const maxRollPoints = profile.maxRollPoints;
    const target = resolvePerRoll(profile, perRoll);
    const flatPenalty = resolveFlatPenalty(profile, flatCount, perRoll);
    const gemBlocked = normalizeFlatCount(flatCount) > 0;

    return STAGES.map(function (stage) {
      const rolls = rollsAt(profile, stage);
      // Flat stats lower both the score and the target by the same amount.
      const benchmark = rolls * target - flatPenalty;

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
        hasStats && modGem && !gemBlocked
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
        gemSourceValue: gem ? gem.sourceValue : null,
        gemSourcePoints: gem ? gem.sourcePoints : null,
        gemTargetLabel: gem ? gem.targetLabel : null,
        gemTargetValue: gem ? gem.targetValue : null,
        gemTargetPoints: gem ? gem.targetPoints : null,
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
    MAX_BASE_SUBSTATS: MAX_BASE_SUBSTATS,
    MAX_FLAT_STATS: MAX_FLAT_STATS,
    normalizeFlatCount: normalizeFlatCount,
    resolveFlatPenalty: resolveFlatPenalty,
    substatOverflow: substatOverflow,
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
    resolvePerRoll: resolvePerRoll,
    round2: round2,
    fmt: fmt,
    weightLabel: weightLabel,
    formatStage: formatStage,
  };
});
