const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../web/calc.js");

const { getProfile, rollsAt, totalRolls, computeScore, rollOptions, effectiveStats, countPlusThree, effectiveStage, buildBenchmarkTable, buildReachability, bestGreaterModGain, GREATER_MOD_MAX, round2 } = calc;

function benchmarks(profile) {
  return buildBenchmarkTable(profile).map((row) => round2(row.benchmark));
}

test("profiles resolve correctly and Lv88 Heroic does not exist", () => {
  assert.equal(getProfile(85, "Epic").key, "epic85");
  assert.equal(getProfile(85, "Heroic").key, "heroic85");
  assert.equal(getProfile(88, "Epic").key, "epic88");
  assert.equal(getProfile(88, "Heroic"), null);
});

test("roll counts match the gear model", () => {
  assert.deepEqual(calc.STAGES.map((s) => rollsAt(getProfile(85, "Epic"), s)), [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(calc.STAGES.map((s) => rollsAt(getProfile(85, "Heroic"), s)), [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(calc.STAGES.map((s) => rollsAt(getProfile(88, "Epic"), s)), [4, 5, 6, 7, 8, 9]);
  assert.equal(totalRolls(getProfile(85, "Epic")), 9);
  assert.equal(totalRolls(getProfile(85, "Heroic")), 8);
  assert.equal(totalRolls(getProfile(88, "Epic")), 9);
});

test("benchmark tables reproduce the supplied numbers exactly", () => {
  assert.deepEqual(benchmarks(getProfile(85, "Epic")), [24.32, 30.4, 36.48, 42.56, 48.64, 54.72]);
  assert.deepEqual(benchmarks(getProfile(85, "Heroic")), [21.12, 28.16, 35.2, 42.24, 49.28, 56.32]);
  assert.deepEqual(benchmarks(getProfile(88, "Epic")), [32.16, 40.2, 48.24, 56.28, 64.32, 72.36]);
});

test("max roll is worth 8 points on Lv85 and 10 points on Lv88", () => {
  const p85 = getProfile(85, "Epic");
  const max85 = { atk: 8, hp: 8, def: 8, spd: 4, cc: 5, cd: 7, eff: 8, er: 8 };
  assert.equal(round2(computeScore(p85, max85).total), 64);

  const p88 = getProfile(88, "Epic");
  const max88 = { atk: 9, hp: 9, def: 9, spd: 5, cc: 6, cd: 8, eff: 9, er: 9 };
  assert.equal(round2(computeScore(p88, max88).total), 80);
});

test("Lv85 score uses the 8-point weights", () => {
  const stats = { atk: 10, hp: 0, def: 0, spd: 5, cc: 5, cd: 7, eff: 0, er: 0 };
  const score = computeScore(getProfile(85, "Epic"), stats);
  assert.equal(round2(score.total), 36);
});

test("Lv88 score uses the 10-point weights", () => {
  const stats = { atk: 10, hp: 0, def: 0, spd: 5, cc: 5, cd: 7, eff: 0, er: 0 };
  const score = computeScore(getProfile(88, "Epic"), stats);
  // 10*(10/9) + 5*2 + 5*(10/6) + 7*(10/8)
  assert.equal(round2(score.total), 38.19);
});

test("blank and negative values count as zero", () => {
  const stats = { atk: "", hp: -4, def: "abc", spd: 0, cc: null, cd: undefined, eff: 0, er: 0 };
  assert.equal(computeScore(getProfile(85, "Epic"), stats).total, 0);
});

test("reachability projects best-case score for future stages", () => {
  const p = getProfile(85, "Epic");
  const rows = buildReachability(p, 0, 24.32, true);
  assert.equal(rows[0].state, "met"); // +0: 24.32 >= 24.32
  assert.equal(rows[1].bestCase, 32.32); // +3: one max roll of 8
  assert.equal(rows[1].state, "reachable"); // 32.32 >= 30.40
  assert.equal(rows[5].bestCase, 64.32); // +15: five max rolls of 8
  assert.equal(rows[5].state, "reachable"); // 64.32 >= 54.72
});

test("reachability detects impossible targets", () => {
  const p = getProfile(85, "Epic");
  const rows = buildReachability(p, 0, 10, true);
  assert.equal(rows[5].bestCase, 50);
  assert.equal(rows[5].state, "unreachable"); // 50 < 54.72
});

test("past stages are marked, remaining rolls are correct", () => {
  const p = getProfile(85, "Heroic");
  const rows = buildReachability(p, 9, 42.24, true);
  assert.equal(rows[0].state, "past");
  assert.equal(rows[2].state, "past");
  assert.equal(rows[3].state, "met"); // +9 current: 42.24 >= 42.24
  assert.equal(rows[4].remaining, 1); // +12
  assert.equal(rows[5].remaining, 2); // +15
});

test("empty input produces neutral reachability", () => {
  const p = getProfile(88, "Epic");
  const rows = buildReachability(p, 0, 0, false);
  assert.equal(rows[0].state, "empty");
  assert.ok(rows.every((row) => row.state === "empty"));
});

test("roll options follow the gear profile and stat kind", () => {
  const p85 = getProfile(85, "Epic");
  const h85 = getProfile(85, "Heroic");
  const p88 = getProfile(88, "Epic");
  assert.deepEqual(rollOptions(p85, "atk"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(p85, "hp"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(p85, "spd"), [2, 3, 4, 5]);
  assert.deepEqual(rollOptions(p85, "cc"), [3, 4, 5]);
  assert.deepEqual(rollOptions(p85, "cd"), [4, 5, 6, 7]);
  assert.deepEqual(rollOptions(h85, "spd"), [1, 2, 3, 4]);
  assert.deepEqual(rollOptions(h85, "atk"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(h85, "cc"), [3, 4, 5]);
  assert.deepEqual(rollOptions(h85, "cd"), [4, 5, 6, 7]);
  assert.deepEqual(rollOptions(p88, "atk"), [5, 6, 7, 8, 9]);
  assert.deepEqual(rollOptions(p88, "spd"), [3, 4, 5]);
  assert.deepEqual(rollOptions(p88, "cc"), [3, 4, 5, 6]);
  assert.deepEqual(rollOptions(p88, "cd"), [4, 5, 6, 7, 8]);
  assert.deepEqual(rollOptions(null, "atk"), []);
  assert.deepEqual(rollOptions(p85, "nope"), []);
});

test("extended Lv 85 SPD rolls score with the standard SPD weight", () => {
  const epic = computeScore(getProfile(85, "Epic"), { spd: 5 });
  assert.equal(round2(epic.total), 10);

  const heroic = computeScore(getProfile(85, "Heroic"), { spd: 1 });
  assert.equal(round2(heroic.total), 2);
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
  const p = getProfile(85, "Epic");
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
  const p85 = getProfile(85, "Epic");
  const p88 = getProfile(88, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5 });
  assert.equal(bestGreaterModGain("off", p85, stats, blankRolls(), 5), null);
  assert.equal(bestGreaterModGain("any", p88, stats, blankRolls(), 5), null);
  assert.equal(bestGreaterModGain("any", p85, blankStats(), blankRolls(), 5), null);
});

test("same-stat mode keeps the higher value and picks the best source", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5, spd: 3 });
  const gem = bestGreaterModGain("same", p, stats, blankRolls(), 5);
  assert.equal(gem.points, 4);
  assert.equal(gem.sourceKey, "atk");
  assert.equal(gem.targetKey, "atk");
  assert.equal(gem.targetValue, 8);
});

test("same-stat mod cannot lower a value above the table maximum", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 9 });
  assert.equal(bestGreaterModGain("same", p, stats, blankRolls(), 0), null);
  const stats2 = Object.assign(blankStats(), { atk: 6 });
  const gem = bestGreaterModGain("same", p, stats2, blankRolls(), 0);
  assert.equal(gem.targetValue, 8);
  assert.equal(round2(gem.points), 2);
});

test("a substat that received a roll is not an eligible gem source", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4, hp: 5, spd: 3 });
  const rolls = Object.assign(blankRolls(), { atk: ["4"] });
  const gem = bestGreaterModGain("same", p, stats, rolls, 4);
  assert.equal(gem.sourceKey, "hp");
  assert.equal(round2(gem.points), 3);

  const allRolled = Object.assign(blankRolls(), { atk: ["4"], hp: ["4"], spd: ["2"] });
  assert.equal(bestGreaterModGain("same", p, stats, allRolled, 2), null);
});

test("any-stat mode excludes stats already on the gear", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4, spd: 3 });
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 5);
  assert.equal(gem.sourceKey, "atk");
  assert.notEqual(gem.targetKey, "spd");
  assert.equal(gem.points, 4);
});

test("any-stat mode excludes Crit Chance as a target", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), {
    atk: 4, hp: 4, def: 4, spd: 3, cd: 7, eff: 4, er: 4,
  });
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 5);
  assert.ok(gem);
  assert.equal(gem.targetKey, gem.sourceKey);
  assert.notEqual(gem.targetKey, "cc");
});

test("a lone substat cannot be modded while rolls remain", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4 });
  assert.equal(bestGreaterModGain("any", p, stats, blankRolls(), 5), null);
  const gem = bestGreaterModGain("any", p, stats, blankRolls(), 0);
  assert.equal(gem.points, 4);
});

test("reachability projects gem points into every stage of Lv85 gear", () => {
  const p = getProfile(85, "Epic");
  const stats = Object.assign(blankStats(), { atk: 4, hp: 4, spd: 3 });
  const modGem = { mode: "any", stats: stats, plusThree: blankRolls() };
  const rows = buildReachability(p, 0, 14, true, modGem);
  assert.ok(rows.every((row) => row.gemPoints === 4));
  assert.ok(rows.every((row) => Math.abs(row.rawBestCase + row.gemPoints - row.bestCase) < 1e-9));
  assert.equal(rows[0].rawBestCase, 14); // no remaining rolls
  assert.equal(rows[0].bestCase, 18); // 14 + 4 gem
  assert.equal(rows[5].rawBestCase, 54); // 14 + 5*8
  assert.equal(rows[5].bestCase, 58); // 54 + 4 gem
});

test("reachability with a gem leaves Lv88 and past stages untouched", () => {
  const p85 = getProfile(85, "Epic");
  const p88 = getProfile(88, "Epic");
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
