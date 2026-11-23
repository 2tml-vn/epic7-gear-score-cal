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
    formatStage,
  } = window.E7Calc;

  const STORAGE_KEY = "e7-gear-sheet-v1";

  const state = {
    level: 85,
    perRoll: Object.fromEntries(
      Object.values(PROFILES).map(function (profile) {
        return [profile.key, profile.perRoll];
      })
    ),
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
    targetPerRoll: document.getElementById("target-per-roll"),
    enhanceControl: document.getElementById("enhance-control"),
    rollCount: document.getElementById("roll-count"),
    statRows: document.getElementById("stat-rows"),
    totalScore: document.getElementById("total-score"),
    reachRows: document.getElementById("reach-rows"),
    reachNote: document.getElementById("reach-note"),
    modGemControl: document.getElementById("mod-gem-control"),
    modPlan: document.getElementById("mod-plan"),
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
  let targetInputProfileKey = "";
  let rowOrderSignature = null;

  function currentProfile() {
    return getProfile(state.level);
  }

  function buildStatRows() {
    STATS.forEach((stat) => {
      const tr = document.createElement("tr");
      tr.dataset.stat = stat.key;
      tr.innerHTML =
        '<td><div class="stat-cell">' +
        '<span class="stat-dot ' + stat.kind + '"></span>' +
        '<span class="stat-name">' + stat.label + "</span>" +
        '<span class="stat-suffix">' + stat.suffix + "</span>" +
        "</div></td>" +
        '<td class="value-cell"><div class="value-wrap">' +
        '<span class="base-tag">BASE</span>' +
        '<select class="roll-select base-roll" data-role="base-roll" data-key="' + stat.key +
        '" aria-label="Base value for ' + stat.label + '"></select>' +
        '<input type="number" min="0" step="0.1" inputmode="decimal" placeholder="custom" id="stat-' +
        stat.key +
        '" data-key="' + stat.key + '" aria-label="' + stat.label + stat.suffix + '">' +
        '<span class="value-projection" hidden></span>' +
        "</div>" +
        '<div class="plus3-list" data-role="plus3-list" data-key="' + stat.key + '"></div>' +
        "</td>" +
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

  // Substats with a base value are grouped at the top, each group in the
  // default STATS order. The arrangement is derived from state.stats, so it
  // persists automatically with the saved base values.
  function displayOrder() {
    const withBase = baseSubstats();
    const withBaseKeys = new Set(withBase.map(function (stat) {
      return stat.key;
    }));
    const withoutBase = STATS.filter(function (stat) {
      return !withBaseKeys.has(stat.key);
    });
    return withBase.concat(withoutBase);
  }

  // Move the existing rows (never rebuild them) so input state and focus are
  // preserved. Only reorder when the set of base-valued stats actually changes.
  function syncStatRowOrder() {
    const order = displayOrder();
    const signature = order
      .map(function (stat) {
        return stat.key;
      })
      .join(",");
    if (signature === rowOrderSignature) return;
    rowOrderSignature = signature;

    const active = document.activeElement;
    const restoreFocus = Boolean(
      active && els.statRows.contains(active) && active.dataset && active.dataset.key
    );
    let selectionStart = null;
    let selectionEnd = null;
    if (restoreFocus && typeof active.selectionStart === "number") {
      try {
        selectionStart = active.selectionStart;
        selectionEnd = active.selectionEnd;
      } catch (err) {
        selectionStart = null;
        selectionEnd = null;
      }
    }

    order.forEach(function (stat) {
      const tr = els.statRows.querySelector('tr[data-stat="' + stat.key + '"]');
      if (tr) els.statRows.appendChild(tr);
    });

    if (restoreFocus && document.contains(active)) {
      active.focus();
      if (selectionStart !== null) {
        try {
          active.setSelectionRange(selectionStart, selectionEnd);
        } catch (err) {
          // Some browsers reject selection ranges on number inputs.
        }
      }
    }
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
    return profile.key === "epic88" ? "10-point system" : "8-point system";
  }

  function buildBenchmarkCards() {
    els.benchGrid.innerHTML = "";
    Object.values(PROFILES).forEach((profile) => {
      const target = state.perRoll[profile.key];
      const rows = buildBenchmarkTable(profile, target);
      const card = document.createElement("article");
      card.className = "bench-card";
      card.dataset.profile = profile.key;
      card.innerHTML =
        '<div class="bench-card-head">' +
        "<div><span class=\"bench-kicker\">" + benchmarkSystem(profile) + "</span><h3>" + profile.label + "</h3></div>" +
        '<span class="bench-badge">' + fmt(target) + " / roll</span>" +
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
        const hasGem = row.gemPoints > 0;
        const raw = row.rawBestCase == null ? "—" : fmt(row.rawBestCase);
        const best = row.bestCase == null ? "—" : fmt(row.bestCase);
        const classes = [isCurrent ? "is-current" : "", row.state === "past" ? "is-past" : ""].filter(Boolean).join(" ");
        let title = row.remaining > 0 ? row.remaining + " remaining roll(s)" : "no remaining rolls";
        if (row.bestCase != null) {
          title = "Raw " + raw + (hasGem ? " + gem " + fmt(row.gemPoints) + " = " + best : "") + " · " + title;
        }
        const bestCell =
          '<span class="best-stack">' +
          '<span class="best-main">' + raw + "</span>" +
          (hasGem
            ? '<span class="best-gem">+' + fmt(row.gemPoints) + " gem → " + best + "</span>"
            : "") +
          "</span>";
        return (
          '<tr class="' + classes + '" data-stage="' + row.stage + '">' +
          "<td>" + formatStage(row.stage) + (isCurrent ? '<span class="now-tag">current</span>' : "") + "</td>" +
          "<td>" + row.rolls + "</td>" +
          "<td>" + fmt(row.benchmark) + "</td>" +
          '<td title="' + title + '">' + bestCell + "</td>" +
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
        " pts per remaining roll (" +
        remaining +
        " to +15). Raw is above the gem line; a stage is reachable when the gem-inclusive best-case meets its benchmark.";
    } else {
      note = "This gear is at +15; no further upgrades remain.";
    }
    els.reachNote.textContent = note;

    const gemRow = rows
      .slice()
      .reverse()
      .find(function (row) {
        return row.gemPoints > 0;
      });
    if (gemRow) {
      const modeText = gemRow.gemMode === "same" ? "Same stat" : "Any stat";
      els.modPlan.innerHTML =
        '<div class="mod-plan-head"><strong>Greater mod gem · ' + modeText +
        '</strong><span>1 base roll kept</span></div>' +
        '<div class="mod-plan-flow">' +
        '<span class="mod-plan-label">FROM</span>' +
        '<span class="mod-plan-stat">' + gemRow.gemSourceLabel + "</span>" +
        '<span class="mod-plan-value">' + fmt(gemRow.gemSourceValue) + "</span>" +
        '<span class="mod-plan-arrow">→</span>' +
        '<span class="mod-plan-label">TO</span>' +
        '<span class="mod-plan-stat">' + gemRow.gemTargetLabel + "</span>" +
        '<span class="mod-plan-value">' + fmt(gemRow.gemTargetValue) + "</span>" +
        '<span class="mod-plan-gain">+' + fmt(gemRow.gemPoints) + " pts</span>" +
        "</div>";
    } else {
      let reason;
      if (profile.level !== 85) reason = "Lv 85 gear only";
      else if (state.modGemMode === "off") reason = "Gem disabled (Off)";
      else if (rows[0] && rows[0].state === "empty") reason = "Enter substats to see a mod plan";
      else reason = "No eligible substat at 1 base roll or no valid target";
      els.modPlan.innerHTML =
        '<div class="mod-plan-head"><strong>Greater mod gem</strong></div>' +
        '<div class="mod-plan-empty">' + reason + "</div>";
    }
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

    syncStatRowOrder();
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

    setSelected(els.enhanceControl, "stage", displayStage, false);

    els.formulaText.textContent = formulaFor(state.level);
    els.profileChip.textContent = profile.label;
    if (profile.key !== targetInputProfileKey || document.activeElement !== els.targetPerRoll) {
      targetInputProfileKey = profile.key;
      els.targetPerRoll.value = String(state.perRoll[profile.key]);
    }
    els.rollCount.textContent = currentRolls + " / " + finalRolls;

    score.rows.forEach((row) => {
      const tr = els.statRows.querySelector('tr[data-stat="' + row.key + '"]');
      if (!tr) return;
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

    syncAddRollControls(profile, displayStage, score);
    renderRollLog();
    renderReach(
      buildReachability(
        profile,
        displayStage,
        score.total,
        hasStats,
        {
          mode: state.modGemMode,
          stats: state.stats,
          plusThree: state.plusThree,
        },
        state.perRoll[profile.key]
      ),
      profile,
      displayStage
    );
    buildBenchmarkCards();
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
      perRoll: Object.assign({}, state.perRoll),
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
    if (saved.perRoll && typeof saved.perRoll === "object") {
      Object.values(PROFILES).forEach(function (profile) {
        const n = Number(saved.perRoll[profile.key]);
        if (Number.isFinite(n) && n > 0) state.perRoll[profile.key] = n;
      });
    }
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
    render();
    scheduleSave();
  });

  els.targetPerRoll.addEventListener("input", function (event) {
    const n = Number(event.target.value);
    const profile = currentProfile();
    if (profile && event.target.value !== "" && Number.isFinite(n) && n > 0) {
      state.perRoll[profile.key] = n;
    }
    render();
    scheduleSave();
  });

  els.targetPerRoll.addEventListener("change", function () {
    const profile = currentProfile();
    if (profile) els.targetPerRoll.value = String(state.perRoll[profile.key]);
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
