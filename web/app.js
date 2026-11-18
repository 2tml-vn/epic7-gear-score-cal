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
    plusThree: Object.fromEntries(STATS.map((stat) => [stat.key, { active: false, roll: "" }])),
    theme: "dark",
    view: "calculator",
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
    benchGrid: document.getElementById("bench-grid"),
  };

  let saveTimer = null;
  let statusTimer = null;
  let hydrated = false;
  let lastProfileKey = "";

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
        '<select class="roll-select base-roll" data-role="base-roll" data-key="' + stat.key +
        '" aria-label="Base roll for ' + stat.label + '"></select>' +
        '<button class="plus3-toggle" type="button" data-role="plus3" data-key="' + stat.key +
        '" aria-pressed="false" title="Add the next +3 roll to ' + stat.label + '">+3</button>' +
        '<select class="roll-select plus3-roll" data-role="plus3-roll" data-key="' + stat.key +
        '" aria-label="Added roll for ' + stat.label + '" hidden></select>' +
        "</div></td>" +
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
      const added = tr.querySelector('[data-role="plus3-roll"]');
      if (base) {
        base.innerHTML = selectMarkup(options, "roll");
        base.value = "";
      }
      if (added) {
        added.innerHTML = selectMarkup(options, "add");
        added.value = "";
      }
    });
  }

  function reconcilePlusThree(profile) {
    STATS.forEach(function (stat) {
      const pt = state.plusThree[stat.key];
      if (!pt.active) return;
      const options = rollOptions(profile, stat.key);
      const valid = options.some(function (v) {
        return String(v) === String(pt.roll);
      });
      if (valid) return;
      const base = parseValue(state.stats[stat.key]);
      const matchesBase = options.some(function (v) {
        return v === base;
      });
      pt.roll = String(matchesBase ? base : options[0]);
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

  function renderReach(rows, profile) {
    els.reachRows.innerHTML = rows
      .map(function (row) {
        const isCurrent = row.stage === state.stage;
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

    const remaining = totalRolls(profile) - rollsAt(profile, state.stage);
    if (rows[0] && rows[0].state === "empty") {
      els.reachNote.textContent = "Enter at least one substat to calculate best-case reachability. Benchmarks are shown for reference.";
    } else if (remaining > 0) {
      els.reachNote.textContent =
        "Best-case = current score + " +
        profile.maxRollPoints +
        " points for each remaining roll (" +
        remaining +
        " to +15). A stage is reachable when its best-case score meets the benchmark.";
    } else {
      els.reachNote.textContent = "This gear is at +15; no further upgrades remain.";
    }
  }

  function renderBenchmarks(profile) {
    els.benchGrid.querySelectorAll(".bench-card").forEach((card) => {
      const active = card.dataset.profile === profile.key;
      card.classList.toggle("is-active", active);
      card.querySelectorAll("tbody tr").forEach((tr) => {
        tr.classList.toggle("is-current", active && Number(tr.dataset.stage) === state.stage);
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

    const effective = effectiveStats(state.stats, state.plusThree);
    const score = computeScore(profile, effective);
    const hasStats = score.rows.some((row) => row.value > 0);
    const currentRolls = rollsAt(profile, state.stage);
    const finalRolls = totalRolls(profile);

    setSelected(els.levelControl, "level", state.level, false);

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
    setSelected(els.enhanceControl, "stage", state.stage, false);

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

      const pt = state.plusThree[row.key];
      const options = rollOptions(profile, row.key);
      const baseSelect = tr.querySelector('[data-role="base-roll"]');
      const addedSelect = tr.querySelector('[data-role="plus3-roll"]');
      const toggle = tr.querySelector('[data-role="plus3"]');
      const projection = tr.querySelector(".value-projection");

      if (baseSelect) {
        baseSelect.value = options.some((v) => String(v) === String(state.stats[row.key]))
          ? state.stats[row.key]
          : "";
      }
      if (addedSelect) {
        addedSelect.value = options.some((v) => String(v) === String(pt.roll)) ? pt.roll : "";
        addedSelect.hidden = !pt.active;
      }
      if (toggle) {
        toggle.classList.toggle("is-active", pt.active);
        toggle.setAttribute("aria-pressed", String(pt.active));
      }
      tr.classList.toggle("has-plus3", pt.active);
      if (projection) {
        projection.hidden = !pt.active;
        projection.textContent = pt.active ? "→ " + fmt(effective[row.key]) : "";
      }
    });

    els.totalScore.textContent = fmt(score.total);
    els.scoreBig.textContent = fmt(score.total);
    els.scoreProfile.textContent = profile.label;
    els.scoreStage.textContent = formatStage(state.stage);
    els.scoreRolls.textContent = currentRolls + (currentRolls === 1 ? " roll" : " rolls");
    els.scoreSystem.textContent = profile.system;
    els.scoreMaxroll.textContent = String(profile.maxRollPoints);
    els.scoreTarget.textContent = fmt(profile.perRoll);

    renderReach(buildReachability(profile, state.stage, score.total, hasStats), profile);
    renderBenchmarks(profile);
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
          return [stat.key, Object.assign({}, state.plusThree[stat.key])];
        })
      ),
      theme: state.theme,
      view: state.view,
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
        if (entry && typeof entry === "object") {
          state.plusThree[stat.key] = {
            active: Boolean(entry.active),
            roll: entry.roll == null ? "" : String(entry.roll),
          };
        }
      });
    }
    if (saved.theme === "dark" || saved.theme === "light") state.theme = saved.theme;
    if (["calculator", "benchmarks", "reference"].indexOf(saved.view) !== -1) state.view = saved.view;
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
    state.stage = Number(btn.dataset.stage);
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
    const added = event.target.closest('select[data-role="plus3-roll"]');
    if (added) {
      state.plusThree[added.dataset.key].roll = added.value;
      render();
      scheduleSave();
    }
  });

  els.statRows.addEventListener("click", function (event) {
    const toggle = event.target.closest('button[data-role="plus3"]');
    if (!toggle) return;
    const key = toggle.dataset.key;
    const pt = state.plusThree[key];
    pt.active = !pt.active;
    if (pt.active && !pt.roll) {
      const options = rollOptions(currentProfile(), key);
      const base = parseValue(state.stats[key]);
      const matchesBase = options.some(function (v) {
        return v === base;
      });
      pt.roll = String(matchesBase ? base : options[0]);
    }
    render();
    scheduleSave();
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
      state.plusThree[stat.key] = { active: false, roll: "" };
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
