(function () {
  "use strict";

  const {
    STAGES,
    STATS,
    PROFILES,
    getProfile,
    rollsAt,
    totalRolls,
    computeScore,
    rollOptions,
    effectiveStats,
    countPlusThree,
    effectiveStage,
    parseValue,
    buildBenchmarkTable,
    buildReachability,
    fmt,
    weightLabel,
    formatStage,
  } = window.E7Calc;

  const STORAGE_KEY = "e7-gear-sheet-v1";

  const state = {
    level: 85,
    rarity: "Epic",
    stage: 0,
    stats: Object.fromEntries(STATS.map((stat) => [stat.key, ""])),
    plusThree: Object.fromEntries(STATS.map((stat) => [stat.key, []])),
    theme: "dark",
    view: "calculator",
    modGemMode: "any",
  };

  const els = {
    saveStatus: document.getElementById("save-status"),
    themeToggle: document.getElementById("theme-toggle"),
    clearStats: document.getElementById("clear-stats"),
    formulaText: document.getElementById("formula-text"),
    profileChip: document.getElementById("profile-chip"),
    levelControl: document.getElementById("level-control"),
    rarityControl: document.getElementById("rarity-control"),
    enhanceControl: document.getElementById("enhance-control"),
    rollCount: document.getElementById("roll-count"),
    statRows: document.getElementById("stat-rows"),
    totalScore: document.getElementById("total-score"),
    scoreBig: document.getElementById("score-big"),
    scoreProfile: document.getElementById("score-profile"),
    scoreStage: document.getElementById("score-stage"),
    scoreRolls: document.getElementById("score-rolls"),
    scoreSystem: document.getElementById("score-system"),
    scoreMaxroll: document.getElementById("score-maxroll"),
    scoreTarget: document.getElementById("score-target"),
    reachRows: document.getElementById("reach-rows"),
    reachNote: document.getElementById("reach-note"),
    modGemControl: document.getElementById("mod-gem-control"),
    benchGrid: document.getElementById("bench-grid"),
    rollTarget: document.getElementById("roll-target"),
    rollValue: document.getElementById("roll-value"),
    addRoll: document.getElementById("add-roll"),
    tallyCount: document.getElementById("tally-count"),
    tallyStage: document.getElementById("tally-stage"),
    tallyRolls: document.getElementById("tally-rolls"),
    tallyScore: document.getElementById("tally-score"),
    rollLog: document.getElementById("roll-log"),
    rollHint: document.getElementById("roll-hint"),
  };

  let saveTimer = null;
  let statusTimer = null;
  let hydrated = false;
  let lastProfileKey = "";
  const chipSignatures = {};
  let targetSignature = "";
  let valueSignature = "";

  function currentProfile() {
    return getProfile(state.level, state.rarity);
  }

  function buildStatRows() {
    STATS.forEach((stat, index) => {
      const tr = document.createElement("tr");
      tr.dataset.stat = stat.key;
      tr.innerHTML =
        '<th class="gutter">' +
        (index + 2) +
        "</th>" +
        '<td><div class="stat-cell">' +
        '<span class="stat-dot ' + stat.kind + '"></span>' +
        '<span class="stat-name">' + stat.label + "</span>" +
        '<span class="stat-suffix">' + stat.suffix + "</span>" +
        "</div></td>" +
        '<td class="value-cell"><div class="value-wrap">' +
        '<input type="number" min="0" step="0.1" inputmode="decimal" placeholder="0" id="stat-' +
        stat.key +
        '" data-key="' + stat.key + '" aria-label="' + stat.label + stat.suffix + '">' +
        '<span class="value-projection" hidden></span>' +
        "</div></td>" +
        '<td class="roll-cell"><div class="roll-controls">' +
        '<span class="base-tag">BASE</span>' +
        '<select class="roll-select base-roll" data-role="base-roll" data-key="' + stat.key +
        '" aria-label="Base value for ' + stat.label + '"></select>' +
        "</div>" +
        '<div class="plus3-list" data-role="plus3-list" data-key="' + stat.key + '"></div>' +
        "</td>" +
        '<td class="weight-cell">×0.000</td>' +
        '<td class="points-cell is-zero">0.00</td>';
      els.statRows.appendChild(tr);
    });
  }

  function selectMarkup(options, placeholder) {
    return (
      '<option value="">' + placeholder + "</option>" +
      options
        .map(function (value) {
          return '<option value="' + value + '">' + value + "</option>";
        })
        .join("")
    );
  }

  function syncRollOptions(profile) {
    STATS.forEach(function (stat) {
      const tr = els.statRows.querySelector('tr[data-stat="' + stat.key + '"]');
      if (!tr) return;
      const options = rollOptions(profile, stat.key);
      const base = tr.querySelector('[data-role="base-roll"]');
      if (base) {
        base.innerHTML = selectMarkup(options, "base");
        base.value = "";
      }
    });
  }

  function reconcilePlusThree(profile) {
    STATS.forEach(function (stat) {
      const options = rollOptions(profile, stat.key);
      state.plusThree[stat.key] = state.plusThree[stat.key].map(function (value) {
        const valid = options.some(function (v) {
          return String(v) === String(value);
        });
        return valid ? String(value) : String(options[0]);
      });
    });
  }

  function trimPlusThree() {
    const max = Math.max(0, Math.floor((15 - state.stage) / 3));
    let excess = countPlusThree(state.plusThree) - max;
    while (excess > 0) {
      for (let i = STATS.length - 1; i >= 0 && excess > 0; i -= 1) {
        const rolls = state.plusThree[STATS[i].key];
        if (rolls.length) {
          rolls.pop();
          excess -= 1;
        }
      }
    }
  }

  // Only substats that already have a base value can receive enhancement rolls.
  function baseSubstats() {
    return STATS.filter(function (stat) {
      return parseValue(state.stats[stat.key]) > 0;
    });
  }

  function addEnhancementRoll(key, value) {
    if (!key || effectiveStage(state.stage, countPlusThree(state.plusThree)) >= 15) return;
    const options = rollOptions(currentProfile(), key);
    const valid = options.some(function (v) {
      return String(v) === String(value);
    });
    if (valid) state.plusThree[key].push(String(value));
  }

  function syncAddRollControls(profile, displayStage, score) {
    const keys = baseSubstats().map(function (stat) {
      return stat.key;
    });
    const targetSig = profile.key + "|" + keys.join(",");
    if (targetSig !== targetSignature) {
      targetSignature = targetSig;
      els.rollTarget.innerHTML = keys
        .map(function (key) {
          const stat = STATS.find(function (s) {
            return s.key === key;
          });
          return '<option value="' + key + '">' + stat.label + stat.suffix + "</option>";
        })
        .join("");
    }
    const targetKey = els.rollTarget.value || keys[0] || "";
    const targetExists = Array.prototype.some.call(els.rollTarget.options, function (option) {
      return option.value === targetKey;
    });
    els.rollTarget.value = targetExists ? targetKey : "";

    const valueSig = profile.key + "|" + targetKey;
    if (valueSig !== valueSignature) {
      valueSignature = valueSig;
      const options = rollOptions(profile, targetKey);
      els.rollValue.innerHTML = options
        .map(function (value) {
          return '<option value="' + value + '">' + value + "</option>";
        })
        .join("");
      els.rollValue.value = options.length ? String(options[0]) : "";
    }

    const full = displayStage >= 15;
    els.addRoll.disabled = full || !targetKey || !els.rollValue.value;
    els.addRoll.title = full ? "Gear is already at +15" : "";
    els.tallyCount.textContent = String(countPlusThree(state.plusThree));
    els.tallyStage.textContent = formatStage(displayStage);
    els.tallyRolls.textContent = rollsAt(profile, displayStage) + " / " + totalRolls(profile);
    els.tallyScore.textContent = fmt(score.total);
    els.rollHint.textContent = keys.length === 0
      ? "Enter the gear's base substat values in the grid below first."
      : full
      ? "This gear is at +15; no further enhancement rolls remain."
      : "Pick a base substat and a roll value, then add the roll. The base value stays unchanged.";
  }

  function renderRollLog() {
    const entries = [];
    STATS.forEach(function (stat) {
      state.plusThree[stat.key].forEach(function (value, index) {
        entries.push({
          key: stat.key,
          index: index,
          label: stat.label + stat.suffix,
          value: value,
        });
      });
    });
    els.rollLog.innerHTML = entries.length
      ? entries
          .map(function (entry) {
            return (
              '<span class="log-entry">' +
              '<span class="log-stat">' + entry.label + "</span>" +
              '<span class="log-value">+' + fmt(parseValue(entry.value)) + "</span>" +
              '<button class="log-remove" type="button" data-role="remove-log-roll" data-key="' + entry.key +
              '" data-index="' + entry.index + '" aria-label="Remove ' + entry.label + " roll " + (entry.index + 1) +
              '" title="Remove this roll">×</button>' +
              "</span>"
            );
          })
          .join("")
      : '<span class="log-empty">No enhancement rolls added yet.</span>';
  }

  function renderChips(profile) {
    STATS.forEach(function (stat) {
      const container = els.statRows.querySelector(
        'tr[data-stat="' + stat.key + '"] [data-role="plus3-list"]'
      );
      if (!container) return;
      const rolls = state.plusThree[stat.key];
      const signature = profile.key + "|" + rolls.join(",");
      if (chipSignatures[stat.key] === signature) return;
      chipSignatures[stat.key] = signature;
      const options = rollOptions(profile, stat.key);
      container.innerHTML = rolls
        .map(function (value, index) {
          return (
            '<div class="plus3-chip">' +
            '<span class="chip-tag">+3</span>' +
            '<span class="chip-index">' + (index + 1) + "</span>" +
            '<select class="roll-select chip-roll" data-role="chip-roll" data-key="' + stat.key +
            '" data-index="' + index + '" aria-label="Enhancement roll ' + (index + 1) + " value for " + stat.label + '">' +
            selectMarkup(options, "roll value") +
            "</select>" +
            '<button class="chip-remove" type="button" data-role="remove-plus3" data-key="' + stat.key +
            '" data-index="' + index + '" aria-label="Remove enhancement roll ' + (index + 1) + " for " + stat.label +
            '" title="Remove this roll">×</button>' +
            "</div>"
          );
        })
        .join("");
      Array.prototype.forEach.call(container.querySelectorAll('[data-role="chip-roll"]'), function (select, index) {
        select.value = rolls[index];
      });
    });
  }

  function benchmarkSystem(profile) {
    if (profile.key === "heroic85") return "8-system target";
    if (profile.key === "epic88") return "10-point system";
    return "8-point system";
  }

  function buildBenchmarkCards() {
    Object.values(PROFILES).forEach((profile) => {
      const rows = buildBenchmarkTable(profile);
      const card = document.createElement("article");
      card.className = "bench-card";
      card.dataset.profile = profile.key;
      card.innerHTML =
        '<div class="bench-card-head">' +
        "<div><span class=\"bench-kicker\">" + benchmarkSystem(profile) + "</span><h3>" + profile.label + "</h3></div>" +
        '<span class="bench-badge">' + fmt(profile.perRoll) + " / roll</span>" +
        "</div>" +
        '<div class="bench-facts">' +
        "<span>" + profile.baseRolls + " base rolls</span>" +
        "<span>" + totalRolls(profile) + " at +15</span>" +
        "<span>max " + profile.maxRollPoints + " pts</span>" +
        "</div>" +
        '<table class="bench-table">' +
        "<thead><tr><th>Stage</th><th>Rolls</th><th>Calculation</th><th>Benchmark</th></tr></thead>" +
        "<tbody>" +
        rows
          .map(function (row) {
            return (
              '<tr data-stage="' + row.stage + '">' +
              "<td>" + formatStage(row.stage) + "</td>" +
              "<td>" + row.rolls + "</td>" +
              '<td class="formula">' + row.formula + "</td>" +
              '<td class="bench-value">' + fmt(row.benchmark) + "</td>" +
              "</tr>"
            );
          })
          .join("") +
        "</tbody></table>" +
        '<p class="bench-note">Cumulative targets, not automatic comparisons.</p>';
      els.benchGrid.appendChild(card);
    });
  }

  function setSelected(container, attr, value, skipDisabled) {
    container.querySelectorAll("button").forEach((btn) => {
      if (skipDisabled && btn.disabled) return;
      const active = String(btn.dataset[attr]) === String(value);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function formulaFor(level) {
    if (level === 88) {
      return "= (ATK% + HP% + DEF% + EFF% + ER%) × 10/9 + SPD × 2 + CC% × 10/6 + CD% × 10/8";
    }
    return "= ATK% + HP% + DEF% + EFF% + ER% + SPD × 2 + CC% × 1.6 + CD% × 8/7";
  }

  function resultLabel(row) {
    switch (row.state) {
      case "met":
        return '<span class="result good">Met</span>';
      case "below":
        return '<span class="result bad">Below</span>';
      case "reachable":
        return '<span class="result good">Reachable</span>';
      case "unreachable":
        return '<span class="result bad">Not reachable</span>';
      default:
        return '<span class="result neutral">—</span>';
    }
  }

  function renderReach(rows, profile, stage) {
    els.reachRows.innerHTML = rows
      .map(function (row) {
        const isCurrent = row.stage === stage;
        const best = row.bestCase == null ? "—" : fmt(row.bestCase);
        const classes = [isCurrent ? "is-current" : "", row.state === "past" ? "is-past" : ""].filter(Boolean).join(" ");
        const title = row.remaining > 0 ? row.remaining + " remaining roll(s)" : "no remaining rolls";
        return (
          '<tr class="' + classes + '" data-stage="' + row.stage + '">' +
          "<td>" + formatStage(row.stage) + (isCurrent ? '<span class="now-tag">current</span>' : "") + "</td>" +
          "<td>" + row.rolls + "</td>" +
          "<td>" + fmt(row.benchmark) + "</td>" +
          '<td title="' + title + '">' + best + "</td>" +
          "<td>" + resultLabel(row) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    const remaining = totalRolls(profile) - rollsAt(profile, stage);
    let note;
    if (rows[0] && rows[0].state === "empty") {
      note = "Enter at least one substat to calculate best-case reachability. Benchmarks are shown for reference.";
    } else if (remaining > 0) {
      note =
        "Best-case = current score + " +
        profile.maxRollPoints +
        " points for each remaining roll (" +
        remaining +
        " to +15). A stage is reachable when its best-case score meets the benchmark.";
    } else {
      note = "This gear is at +15; no further upgrades remain.";
    }

    const gemRow = rows
      .slice()
      .reverse()
      .find(function (row) {
        return row.gemPoints > 0;
      });
    const isEmpty = rows[0] && rows[0].state === "empty";
    if (gemRow) {
      const modeText = gemRow.gemMode === "same" ? "Same stat" : "Any stat";
      note +=
        " Includes +" +
        fmt(gemRow.gemPoints) +
        " pts from one Greater gem (" +
        modeText +
        " mode: " +
        gemRow.gemSourceLabel +
        " → " +
        gemRow.gemTargetLabel +
        " " +
        fmt(gemRow.gemTargetValue) +
        "); that substat was kept at 1 base roll.";
    } else if (!isEmpty && profile.level === 85 && state.modGemMode !== "off") {
      note +=
        " No Greater gem gain: no eligible substat is still at 1 base roll or no valid target remains.";
    }
    els.reachNote.textContent = note;
  }

  function renderBenchmarks(profile, stage) {
    els.benchGrid.querySelectorAll(".bench-card").forEach((card) => {
      const active = card.dataset.profile === profile.key;
      card.classList.toggle("is-active", active);
      card.querySelectorAll("tbody tr").forEach((tr) => {
        tr.classList.toggle("is-current", active && Number(tr.dataset.stage) === stage);
      });
    });
  }

  function renderTabs() {
    document.querySelectorAll(".sheet-tab").forEach((btn) => {
      const active = btn.dataset.view === state.view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".sheet-view").forEach((view) => {
      const active = view.id === "view-" + state.view;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    });
  }

  function render() {
    const profile = currentProfile();
    if (!profile) return;

    if (profile.key !== lastProfileKey) {
      syncRollOptions(profile);
      reconcilePlusThree(profile);
      lastProfileKey = profile.key;
    }

    renderChips(profile);
    const effective = effectiveStats(state.stats, state.plusThree);
    const score = computeScore(profile, effective);
    const hasStats = score.rows.some((row) => row.value > 0);
    const displayStage = effectiveStage(state.stage, countPlusThree(state.plusThree));
    const currentRolls = rollsAt(profile, displayStage);
    const finalRolls = totalRolls(profile);

    setSelected(els.levelControl, "level", state.level, false);

    const modDisabled = profile.level !== 85;
    els.modGemControl.querySelectorAll("button").forEach((btn) => {
      btn.disabled = modDisabled;
      btn.title = modDisabled ? "Mod gems only apply to Lv 85 gear" : "";
    });
    setSelected(els.modGemControl, "modGem", state.modGemMode, true);

    els.rarityControl.querySelectorAll("button").forEach((btn) => {
      const disabled = state.level === 88 && btn.dataset.rarity === "Heroic";
      btn.disabled = disabled;
      btn.title = disabled ? "Lv 88 Heroic gear is not part of this model" : "";
      if (disabled) {
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
      }
    });
    setSelected(els.rarityControl, "rarity", state.rarity, true);
    setSelected(els.enhanceControl, "stage", displayStage, false);

    els.formulaText.textContent = formulaFor(state.level);
    els.profileChip.textContent = profile.label;
    els.rollCount.textContent = currentRolls + " / " + finalRolls;

    score.rows.forEach((row) => {
      const tr = els.statRows.querySelector('tr[data-stat="' + row.key + '"]');
      if (!tr) return;
      tr.querySelector(".weight-cell").textContent = weightLabel(profile, row.key);
      const pointsCell = tr.querySelector(".points-cell");
      pointsCell.textContent = fmt(row.points);
      pointsCell.classList.toggle("is-zero", row.points === 0);

      const rolls = state.plusThree[row.key];
      const options = rollOptions(profile, row.key);
      const baseSelect = tr.querySelector('[data-role="base-roll"]');
      const projection = tr.querySelector(".value-projection");

      if (baseSelect) {
        baseSelect.value = options.some((v) => String(v) === String(state.stats[row.key]))
          ? state.stats[row.key]
          : "";
      }
      tr.classList.toggle("has-plus3", rolls.length > 0);
      if (projection) {
        projection.hidden = rolls.length === 0;
        projection.textContent = rolls.length ? "→ " + fmt(effective[row.key]) : "";
        projection.title = rolls.length
          ? fmt(parseValue(state.stats[row.key])) +
            " + " +
            rolls.map(function (value) {
              return fmt(parseValue(value));
            }).join(" + ") +
            " = " +
            fmt(effective[row.key])
          : "";
      }
    });

    els.totalScore.textContent = fmt(score.total);
    els.scoreBig.textContent = fmt(score.total);
    els.scoreProfile.textContent = profile.label;
    els.scoreStage.textContent = formatStage(displayStage);
    els.scoreRolls.textContent = currentRolls + (currentRolls === 1 ? " roll" : " rolls");
    els.scoreSystem.textContent = profile.system;
    els.scoreMaxroll.textContent = String(profile.maxRollPoints);
    els.scoreTarget.textContent = fmt(profile.perRoll);

    syncAddRollControls(profile, displayStage, score);
    renderRollLog();
    renderReach(
      buildReachability(profile, displayStage, score.total, hasStats, {
        mode: state.modGemMode,
        stats: state.stats,
        plusThree: state.plusThree,
      }),
      profile,
      displayStage
    );
    renderBenchmarks(profile, displayStage);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const label = state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.title = label;
  }

  function flashStatus(text, saved) {
    els.saveStatus.textContent = text;
    els.saveStatus.classList.toggle("is-saved", Boolean(saved));
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      els.saveStatus.textContent = "Ready";
      els.saveStatus.classList.remove("is-saved");
    }, 1300);
  }

  function saveState() {
    const payload = {
      version: 1,
      level: state.level,
      rarity: state.rarity,
      stage: state.stage,
      stats: Object.assign({}, state.stats),
      plusThree: Object.fromEntries(
        STATS.map(function (stat) {
          return [stat.key, state.plusThree[stat.key].slice()];
        })
      ),
      theme: state.theme,
      view: state.view,
      modGemMode: state.modGemMode,
    };
    try {
      const api = window.pywebview && window.pywebview.api;
      if (api && typeof api.save_state === "function") {
        const promise = api.save_state(payload);
        if (promise && typeof promise.catch === "function") promise.catch(function () {});
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
      flashStatus("Saved", true);
    } catch (err) {
      console.warn("Could not save state", err);
      flashStatus("Not saved", false);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 220);
  }

  function applySaved(saved) {
    if (!saved || typeof saved !== "object") return;
    const lv = Number(saved.level);
    if (lv === 85 || lv === 88) state.level = lv;
    if (saved.rarity === "Epic" || saved.rarity === "Heroic") state.rarity = saved.rarity;
    if (state.level === 88) state.rarity = "Epic";
    const st = Number(saved.stage);
    if (STAGES.includes(st)) state.stage = st;
    if (saved.stats && typeof saved.stats === "object") {
      STATS.forEach(function (stat) {
        const value = saved.stats[stat.key];
        state.stats[stat.key] = value == null ? "" : String(value);
      });
    }
    if (saved.plusThree && typeof saved.plusThree === "object") {
      STATS.forEach(function (stat) {
        const entry = saved.plusThree[stat.key];
        if (Array.isArray(entry)) {
          state.plusThree[stat.key] = entry.map(function (value) {
            return value == null ? "" : String(value);
          });
        } else if (entry && typeof entry === "object" && entry.active) {
          // Migrate the previous single-roll shape.
          state.plusThree[stat.key] = [entry.roll == null ? "" : String(entry.roll)];
        }
      });
      trimPlusThree();
    }
    if (saved.theme === "dark" || saved.theme === "light") state.theme = saved.theme;
    if (["calculator", "benchmarks", "reference"].indexOf(saved.view) !== -1) state.view = saved.view;
    if (["off", "same", "any"].indexOf(saved.modGemMode) !== -1) state.modGemMode = saved.modGemMode;
    syncInputs();
  }

  function syncInputs() {
    STATS.forEach(function (stat) {
      const input = document.getElementById("stat-" + stat.key);
      if (input) input.value = state.stats[stat.key] || "";
    });
  }

  async function loadSaved(fromApi) {
    if (hydrated) return;
    let saved = null;
    try {
      if (fromApi && window.pywebview && window.pywebview.api && typeof window.pywebview.api.load_state === "function") {
        saved = await window.pywebview.api.load_state();
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      }
    } catch (err) {
      console.warn("Could not load state", err);
    }
    applySaved(saved);
    hydrated = true;
    applyTheme();
    render();
    renderTabs();
    flashStatus("Ready", false);
  }

  function init() {
    buildStatRows();
    buildBenchmarkCards();
    applyTheme();
    render();
    renderTabs();

    const api = window.pywebview && window.pywebview.api;
    if (api && typeof api.load_state === "function") {
      loadSaved(true);
    } else {
      window.addEventListener("pywebviewready", function () {
        loadSaved(true);
      }, { once: true });
      setTimeout(function () {
        if (!hydrated) loadSaved(Boolean(window.pywebview && window.pywebview.api));
      }, 1200);
    }
  }

  els.modGemControl.addEventListener("click", function (event) {
    const btn = event.target.closest("button[data-mod-gem]");
    if (!btn || btn.disabled) return;
    state.modGemMode = btn.dataset.modGem;
    render();
    scheduleSave();
  });

  els.levelControl.addEventListener("click", function (event) {
    const btn = event.target.closest("button[data-level]");
    if (!btn || btn.disabled) return;
    state.level = Number(btn.dataset.level);
    if (state.level === 88) state.rarity = "Epic";
    render();
    scheduleSave();
  });

  els.rarityControl.addEventListener("click", function (event) {
    const btn = event.target.closest("button[data-rarity]");
    if (!btn || btn.disabled) return;
    state.rarity = btn.dataset.rarity;
    render();
    scheduleSave();
  });

  els.enhanceControl.addEventListener("click", function (event) {
    const btn = event.target.closest("button[data-stage]");
    if (!btn || btn.disabled) return;
    const desired = Number(btn.dataset.stage);
    trimPlusThree();
    let excess = countPlusThree(state.plusThree) - Math.floor(desired / 3);
    while (excess > 0) {
      for (let i = STATS.length - 1; i >= 0 && excess > 0; i -= 1) {
        const rolls = state.plusThree[STATS[i].key];
        if (rolls.length) {
          rolls.pop();
          excess -= 1;
        }
      }
    }
    state.stage = Math.max(0, desired - 3 * countPlusThree(state.plusThree));
    render();
    scheduleSave();
  });

  els.statRows.addEventListener("input", function (event) {
    const input = event.target.closest("input[data-key]");
    if (!input) return;
    state.stats[input.dataset.key] = input.value;
    render();
    scheduleSave();
  });

  els.statRows.addEventListener("change", function (event) {
    const base = event.target.closest('select[data-role="base-roll"]');
    if (base) {
      state.stats[base.dataset.key] = base.value;
      syncInputs();
      render();
      scheduleSave();
      return;
    }
    // A roll picker only edits that roll. It must never touch state.stats,
    // which holds the base value set by the BASE picker / number input.
    const chip = event.target.closest('select[data-role="chip-roll"]');
    if (chip) {
      const rolls = state.plusThree[chip.dataset.key];
      const index = Number(chip.dataset.index);
      if (rolls && index >= 0 && index < rolls.length) {
        rolls[index] = chip.value;
        render();
        scheduleSave();
      }
    }
  });

  els.statRows.addEventListener("click", function (event) {
    const remove = event.target.closest('button[data-role="remove-plus3"]');
    if (remove) {
      const rolls = state.plusThree[remove.dataset.key];
      const index = Number(remove.dataset.index);
      if (rolls && index >= 0 && index < rolls.length) {
        rolls.splice(index, 1);
        render();
        scheduleSave();
      }
    }
  });

  els.rollTarget.addEventListener("change", function () {
    valueSignature = "";
    render();
  });

  els.addRoll.addEventListener("click", function () {
    addEnhancementRoll(els.rollTarget.value, els.rollValue.value);
    render();
    scheduleSave();
  });

  els.rollLog.addEventListener("click", function (event) {
    const remove = event.target.closest('button[data-role="remove-log-roll"]');
    if (!remove) return;
    const rolls = state.plusThree[remove.dataset.key];
    const index = Number(remove.dataset.index);
    if (rolls && index >= 0 && index < rolls.length) {
      rolls.splice(index, 1);
      render();
      scheduleSave();
    }
  });

  els.statRows.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    const inputs = Array.from(els.statRows.querySelectorAll("input[data-key]"));
    const index = inputs.indexOf(event.target);
    if (index !== -1) {
      event.preventDefault();
      inputs[(index + 1) % inputs.length].focus();
    }
  });

  els.statRows.addEventListener("wheel", function (event) {
    if (event.target.matches("input[type=number]")) event.target.blur();
  }, { passive: true });

  els.clearStats.addEventListener("click", function () {
    STATS.forEach(function (stat) {
      state.stats[stat.key] = "";
      state.plusThree[stat.key] = [];
    });
    syncInputs();
    render();
    scheduleSave();
    flashStatus("Cleared", false);
  });

  els.themeToggle.addEventListener("click", function () {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    scheduleSave();
  });

  document.querySelector(".sheet-tabs").addEventListener("click", function (event) {
    const btn = event.target.closest(".sheet-tab");
    if (!btn) return;
    state.view = btn.dataset.view;
    renderTabs();
    scheduleSave();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
