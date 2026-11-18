const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../web/calc.js");

const { getProfile, rollsAt, totalRolls, computeScore, buildBenchmarkTable, buildReachability, round2 } = calc;

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
