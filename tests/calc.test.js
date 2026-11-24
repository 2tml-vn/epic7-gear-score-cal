const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../web/calc.js");

const { getProfile, rollsAt, totalRolls, computeScore, rollOptions, effectiveStats, countPlusThree, effectiveStage, buildBenchmarkTable, buildReachability, bestGreaterModGain, normalizeFlatCount, resolveFlatAdjustment, substatOverflow, GREATER_MOD_MAX, round2 } = calc;

function benchmarks(profile, perRoll) {
  return buildBenchmarkTable(profile, perRoll).map((row) => round2(row.benchmark));
}

test("profiles resolve correctly and only Epic exists", () => {
  assert.equal(getProfile(85).key, "epic85");
  assert.equal(getProfile(88).key, "epic88");
  assert.equal(getProfile(87), null);
  assert.equal(calc.PROFILES.heroic85, undefined);
  assert.equal(calc.ROLL_RANGES.heroic85, undefined);
});

test("roll counts match the gear model", () => {
  assert.deepEqual(calc.STAGES.map((s) => rollsAt(getProfile(85), s)), [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(calc.STAGES.map((s) => rollsAt(getProfile(88), s)), [4, 5, 6, 7, 8, 9]);
  assert.equal(totalRolls(getProfile(85)), 9);
  assert.equal(totalRolls(getProfile(88)), 9);
});

test("benchmark tables reproduce the supplied numbers exactly", () => {
  assert.deepEqual(benchmarks(getProfile(85)), [24.32, 30.4, 36.48, 42.56, 48.64, 54.72]);
  assert.deepEqual(benchmarks(getProfile(88)), [32.16, 40.2, 48.24, 56.28, 64.32, 72.36]);
});

test("benchmark target per roll is adjustable without mutating profiles", () => {
  const p85 = getProfile(85);
  const p88 = getProfile(88);

  assert.deepEqual(benchmarks(p85, 7), [28, 35, 42, 49, 56, 63]);
  assert.deepEqual(benchmarks(p88, 9), [36, 45, 54, 63, 72, 81]);

  const rows = buildBenchmarkTable(p85, 7);
  assert.equal(rows[0].formula, "4 × 7.00");
  assert.equal(rows[5].formula, "9 × 7.00");

  // Invalid overrides fall back to the profile default.
  assert.deepEqual(benchmarks(p85, 0), [24.32, 30.4, 36.48, 42.56, 48.64, 54.72]);
  assert.deepEqual(benchmarks(p85, -3), [24.32, 30.4, 36.48, 42.56, 48.64, 54.72]);

  // Frozen defaults are unchanged.
  assert.equal(p85.perRoll, 6.08);
  assert.equal(p88.perRoll, 8.04);
});

test("reachability uses the adjusted target per roll", () => {
  const p = getProfile(85);
  const base = buildReachability(p, 0, 24.32, true);
  const raised = buildReachability(p, 0, 24.32, true, null, 7);

  assert.equal(base[1].benchmark, 30.4);
  assert.equal(raised[1].benchmark, 35);
  assert.equal(base[1].state, "reachable"); // 32.32 >= 30.40
  assert.equal(raised[1].state, "unreachable"); // 32.32 < 35
  assert.equal(raised[5].benchmark, 63);
  assert.equal(raised[5].bestCase, 64.32); // best-case math is unchanged
});

test("max roll is worth 8 points on Lv85 and 10 points on Lv88", () => {
  const p85 = getProfile(85);
  const max85 = { atk: 8, hp: 8, def: 8, spd: 4, cc: 5, cd: 7, eff: 8, er: 8 };
  assert.equal(round2(computeScore(p85, max85).total), 64);

  const p88 = getProfile(88);
  const max88 = { atk: 9, hp: 9, def: 9, spd: 5, cc: 6, cd: 8, eff: 9, er: 9 };
  assert.equal(round2(computeScore(p88, max88).total), 80);
});

test("Lv85 score uses the 8-point weights", () => {
  const stats = { atk: 10, hp: 0, def: 0, spd: 5, cc: 5, cd: 7, eff: 0, er: 0 };
  const score = computeScore(getProfile(85), stats);
  assert.equal(round2(score.total), 36);
});

test("Lv88 score uses the 10-point weights", () => {
  const stats = { atk: 10, hp: 0, def: 0, spd: 5, cc: 5, cd: 7, eff: 0, er: 0 };
  const score = computeScore(getProfile(88), stats);
  // 10*(10/9) + 5*2 + 5*(10/6) + 7*(10/8)
  assert.equal(round2(score.total), 38.19);
});

test("blank and negative values count as zero", () => {
  const stats = { atk: "", hp: -4, def: "abc", spd: 0, cc: null, cd: undefined, eff: 0, er: 0 };
  assert.equal(computeScore(getProfile(85), stats).total, 0);
});

test("reachability projects best-case score for future stages", () => {
  const p = getProfile(85);
  const rows = buildReachability(p, 0, 24.32, true);
  assert.equal(rows[0].state, "met"); // +0: 24.32 >= 24.32
  assert.equal(rows[1].bestCase, 32.32); // +3: one max roll of 8
  assert.equal(rows[1].state, "reachable"); // 32.32 >= 30.40
  assert.equal(rows[5].bestCase, 64.32); // +15: five max rolls of 8
  assert.equal(rows[5].state, "reachable"); // 64.32 >= 54.72
});

test("reachability detects impossible targets", () => {
  const p = getProfile(85);
  const rows = buildReachability(p, 0, 10, true);
  assert.equal(rows[5].bestCase, 50);
  assert.equal(rows[5].state, "unreachable"); // 50 < 54.72
});

test("past stages are marked, remaining rolls are correct", () => {
  const p = getProfile(85);
  const rows = buildReachability(p, 9, 42.56, true);
  assert.equal(rows[0].state, "past");
  assert.equal(rows[2].state, "past");
  assert.equal(rows[3].state, "met"); // +9 current: 42.56 >= 42.56
  assert.equal(rows[4].remaining, 1); // +12
  assert.equal(rows[5].remaining, 2); // +15
});

test("empty input produces neutral reachability", () => {
  const p = getProfile(88);
  const rows = buildReachability(p, 0, 0, false);
  assert.equal(rows[0].state, "empty");
  assert.ok(rows.every((row) => row.state === "empty"));
});

test("roll options follow the gear profile and stat kind", () => {
  const p85 = getProfile(85);
  const p88 = getProfile(88);
  assert.deepEqual(rollOptions(p85, "atk"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(p85, "hp"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(p85, "spd"), [2, 3, 4, 5]);
  assert.deepEqual(rollOptions(p85, "cc"), [3, 4, 5]);
  assert.deepEqual(rollOptions(p85, "cd"), [4, 5, 6, 7]);
  assert.deepEqual(rollOptions(p88, "atk"), [5, 6, 7, 8, 9]);
  assert.deepEqual(rollOptions(p88, "spd"), [3, 4, 5]);
  assert.deepEqual(rollOptions(p88, "cc"), [3, 4, 5, 6]);
  assert.deepEqual(rollOptions(p88, "cd"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(null, "atk"), []);
  assert.deepEqual(rollOptions(p85, "nope"), []);
});

test("extended Lv 85 SPD rolls score with the standard SPD weight", () => {
  const epic = computeScore(getProfile(85), { spd: 5 });
  assert.equal(round2(epic.total), 10);
});

test("effective stats stack every enhancement roll landed on a substat", () => {
  const stats = { atk: "6", hp: 5, def: "", spd: 3, cc: "", cd: 0, eff: "", er: "" };
  const plusThree = {
    atk: ["4", 5, "6"],
    hp: [],
    spd: [""],
  };
  const eff = effectiveStats(stats, plusThree);
  assert.equal(eff.atk, 21);
  assert.equal(eff.hp, 5);
  assert.equal(eff.spd, 3);
  assert.equal(eff.def, 0);
});

test("count and effective stage follow the number of added rolls", () => {
  const plusThree = { atk: ["4", "5"], hp: [], spd: ["3"] };
  assert.equal(countPlusThree(plusThree), 3);
  assert.equal(countPlusThree({}), 0);
  assert.equal(effectiveStage(0, 3), 9);
  assert.equal(effectiveStage(9, 2), 15);
  assert.equal(effectiveStage(0, 9), 15);
  assert.equal(effectiveStage(12, 1), 15);
});

test("score uses the stacked value for a substat with multiple rolls", () => {
  const p = getProfile(85);
  const base = { atk: 6, hp: 0, def: 0, spd: 0, cc: 0, cd: 0, eff: 0, er: 0 };
  const plusThree = { atk: [4, 5] };
  const score = computeScore(p, effectiveStats(base, plusThree));
  assert.equal(round2(score.total), 15);
  assert.equal(round2(score.rows[0].points), 15);
});

const blankStats = () => ({ atk: "", hp: "", def: "", spd: "", cc: "", cd: "", eff: "", er: "" });
const blankRolls = () => ({ atk: [], hp: [], def: [], spd: [], cc: [], cd: [], eff: [], er: [] });

test("Greater mod gem uses the level 88-or-lower base roll maximums", () => {
  assert.deepEqual(GREATER_MOD_MAX, { pct: 8, spd: 4, cd: 7 });
  assert.equal(GREATER_MOD_MAX.cc, undefined);
});

test("mod gem is disabled off, on Lv88, or with no eligible substat", () => {
  const p85 = getProfile(85);
  const p88 = getProfile(88);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5 });
  assert.equal(bestGreaterModGain("off", p85, stats, blankRolls(), 5), null);
  assert.equal(bestGreaterModGain("any", p88, stats, blankRolls(), 5), null);
  assert.equal(bestGreaterModGain("any", p85, blankStats(), blankRolls(), 5), null);
});

test("same-stat mode keeps the higher value and picks the best source", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5, spd: 3 });
  const gem = bestGreaterModGain("same", p, stats, blankRolls(), 5);
  assert.equal(gem.points, 4);
  assert.equal(gem.sourceKey, "atk");
  assert.equal(gem.targetKey, "atk");
  assert.equal(gem.targetValue, 8);
});

test("same-stat mod cannot lower a value above the table maximum", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 9 });
  assert.equal(bestGreaterModGain("same", p, stats, blankRolls(), 0), null);
  const stats2 = Object.assign(blankStats(), { atk: 6 });
  const gem = bestGreaterModGain("same", p, stats2, blankRolls(), 0);
  assert.equal(gem.targetValue, 8);
  assert.equal(round2(gem.points), 2);
});

test("a substat that received a roll is not an eligible gem source", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5, spd: 3 });
  const rolls = Object.assign(blankRolls(), { atk: ["4"] });
  const gem = bestGreaterModGain("same", p, stats, rolls, 4);
  assert.equal(gem.sourceKey, "hp");
  assert.equal(round2(gem.points), 3);

  const allRolled = Object.assign(blankRolls(), { atk: ["4"], hp: ["4"], spd: ["2"] });
  assert.equal(bestGreaterModGain("same", p, stats, allRolled, 2), null);
});

test("any-stat mode excludes stats already on the gear", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4, spd: 3 });
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 5);
  assert.equal(gem.sourceKey, "atk");
  assert.notEqual(gem.targetKey, "spd");
  assert.equal(gem.points, 4);
});

test("any-stat mode excludes Crit Chance as a target", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), {
    atk: 4, hp: 4, def: 4, spd: 3, cd: 7, eff: 4, er: 4,
  });
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 5);
  assert.ok(gem);
  assert.equal(gem.targetKey, gem.sourceKey);
  assert.notEqual(gem.targetKey, "cc");
});

test("a lone substat cannot be modded while rolls remain", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4 });
  assert.equal(bestGreaterModGain("any", p, stats, blankRolls(), 5), null);
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 0);
  assert.equal(gem.points, 4);
});

test("reachability projects gem points into every stage of Lv85 gear", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 4, spd: 3 });
  const modGem = { mode: "any", stats: stats, plusThree: blankRolls() };
  const rows = buildReachability(p, 0, 14, true, modGem);
  assert.ok(rows.every((row) => row.gemPoints === 4));
  assert.ok(rows.every((row) => Math.abs(row.rawBestCase + row.gemPoints - row.bestCase) < 1e-9));
  assert.equal(rows[0].rawBestCase, 14); // no remaining rolls
  assert.equal(rows[0].bestCase, 18); // 14 + 4 gem
  assert.equal(rows[5].rawBestCase, 54); // 14 + 5*8
  assert.equal(rows[5].bestCase, 58); // 54 + 4 gem
  assert.equal(rows[5].gemSourceLabel, "ATK%");
  assert.equal(rows[5].gemSourceValue, 4);
  assert.equal(rows[5].gemSourcePoints, 4);
  assert.equal(rows[5].gemTargetPoints, 8);
  assert.ok(Math.abs(rows[5].gemSourcePoints + rows[5].gemPoints - rows[5].gemTargetPoints) < 1e-9);
});

test("reachability with a gem leaves Lv88 and past stages untouched", () => {
  const p85 = getProfile(85);
  const p88 = getProfile(88);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 4, spd: 3 });
  const modGem = { mode: "any", stats: stats, plusThree: blankRolls() };

  const l88 = buildReachability(p88, 0, 14, true, modGem);
  assert.ok(l88.every((row) => row.gemPoints === 0));
  assert.ok(l88.every((row) => row.rawBestCase === row.bestCase));
  assert.equal(l88[5].bestCase, 64); // 14 + 5*10

  const past = buildReachability(p85, 9, 14, true, modGem);
  assert.equal(past[0].gemPoints, 0);
  assert.equal(past[0].bestCase, null);
  assert.equal(past[5].bestCase, 34); // 14 + 2*8 + 4
});

test("flat count is clamped to an integer from 0 to 3", () => {
  assert.equal(normalizeFlatCount(undefined), 0);
  assert.equal(normalizeFlatCount(null), 0);
  assert.equal(normalizeFlatCount("abc"), 0);
  assert.equal(normalizeFlatCount(-2), 0);
  assert.equal(normalizeFlatCount(2.9), 2);
  assert.equal(normalizeFlatCount(7), 3);
  assert.equal(normalizeFlatCount("3"), 3);
});

test("flat adjustment is 8 + (n−1) × target and never changes the score", () => {
  const p85 = getProfile(85);
  const p88 = getProfile(88);
  const stats = Object.assign(blankStats(), { atk: 8, spd: 4 });
  assert.equal(computeScore(p85, stats).total, 16); // 8 + 4*2
  assert.equal(computeScore(p85, stats, 3, 7).total, 16); // extra args are ignored

  assert.equal(resolveFlatAdjustment(p85, 0), 0);
  assert.equal(resolveFlatAdjustment(p85, 1), 8);
  assert.equal(round2(resolveFlatAdjustment(p85, 2)), 14.08);
  assert.equal(round2(resolveFlatAdjustment(p85, 3)), 20.16);

  // Invalid overrides fall back to the Lv85 default of 6.08.
  assert.equal(round2(resolveFlatAdjustment(p85, 2, 0)), 14.08);
  assert.equal(round2(resolveFlatAdjustment(p85, 2, -3)), 14.08);

  // A custom Target / roll scales only the extra flats.
  assert.equal(resolveFlatAdjustment(p85, 1, 7), 8);
  assert.equal(resolveFlatAdjustment(p85, 2, 7), 15);
  assert.equal(resolveFlatAdjustment(p85, 3, 7), 22);

  // Lv88 Epic ignores flats entirely.
  assert.equal(resolveFlatAdjustment(p88, 3, 8.04), 0);
});

test("flat adjustment lowers the Bench column and changes the verdict", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 10 }); // score 10, unaffected by flats
  const score = computeScore(p, stats);
  assert.equal(score.total, 10);
  assert.equal(round2(resolveFlatAdjustment(p, 2)), 14.08);

  const flat = buildReachability(p, 0, score.total, true, null, undefined, 2);
  assert.deepEqual(
    flat.map((row) => round2(row.benchmark)),
    [10.24, 16.32, 22.4, 28.48, 34.56, 40.64]
  );

  // Best case is unchanged by flats: 10 + 5 × 8 = 50.
  const unchanged = buildReachability(p, 0, score.total, true);
  assert.equal(unchanged[5].benchmark, 54.72);
  assert.equal(unchanged[5].bestCase, 50);
  assert.equal(unchanged[5].reachable, false); // 50 < 54.72

  assert.equal(flat[5].bestCase, 50);
  assert.equal(flat[5].reachable, true); // 50 ≥ 40.64
  assert.equal(flat[5].state, "reachable");

  // Past stages show the reduced Bench too.
  const past = buildReachability(p, 9, score.total, true, null, undefined, 2);
  assert.equal(round2(past[0].benchmark), 10.24);
  assert.equal(past[0].state, "past");

  // A gear with no flats keeps the original benchmark table.
  const plain = buildReachability(p, 0, score.total, true);
  assert.deepEqual(
    plain.map((row) => round2(row.benchmark)),
    [24.32, 30.4, 36.48, 42.56, 48.64, 54.72]
  );
});

test("a single flat lowers the Bench column by 8", () => {
  const p = getProfile(85);
  const score = computeScore(p, blankStats());
  assert.equal(score.total, 0);
  assert.equal(resolveFlatAdjustment(p, 1), 8);

  const rows = buildReachability(p, 0, score.total, true, null, undefined, 1);
  assert.deepEqual(
    rows.map((row) => round2(row.benchmark)),
    [16.32, 22.4, 28.48, 34.56, 40.64, 46.72]
  );

  // An edited target changes the benchmark base, but not the flat adjustment.
  const custom = buildReachability(p, 0, score.total, true, null, 7, 1);
  assert.equal(custom[0].benchmark, 20); // 4 × 7 − 8
});

test("flat stats disable the mod gem in reachability", () => {
  const p = getProfile(85);
  const stats = Object.assign(blankStats(), { atk: 4, hp: 4, spd: 3 });
  const modGem = { mode: "any", stats: stats, plusThree: blankRolls() };

  const withFlats = buildReachability(p, 0, 14, true, modGem, undefined, 1);
  assert.ok(withFlats.every((row) => row.gemPoints === 0));
  assert.ok(withFlats.every((row) => row.bestCase === row.rawBestCase));

  const noFlats = buildReachability(p, 0, 14, true, modGem, undefined, 0);
  assert.equal(noFlats[5].gemPoints, 4);
});

test("substat slot overflow is reported but does not block scoring", () => {
  const threeBase = Object.assign(blankStats(), { atk: 4, hp: 5, spd: 3 });
  assert.equal(substatOverflow(1, threeBase), null); // exactly four slots
  assert.deepEqual(substatOverflow(3, threeBase), { flats: 3, base: 3, total: 6, max: 4 });
  assert.equal(substatOverflow(0, threeBase), null);
  assert.equal(substatOverflow(2, blankStats()), null);

  // The score is still calculated with an invalid combination; the adjustment
  // is reported rather than blocking it.
  assert.equal(computeScore(getProfile(85), threeBase).total, 15);
  assert.equal(round2(resolveFlatAdjustment(getProfile(85), 3)), 20.16);
});
