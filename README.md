# E7 Gear Sheet

A portable, offline Windows app that calculates Epic Seven gear scores and checks whether a piece can still reach each enhancement benchmark. It looks and works like a small spreadsheet.

## What it does

**Inputs**
- Gear level: 85 or 88 (Epic only)
- Enhancement: `+0`, `+3`, `+6`, `+9`, `+12`, `+15`
- Substats (default order): ATK%, HP%, DEF%, Effectiveness%, Effect Resist%, SPD, Crit Chance%, Crit Damage%
- Each substat has a dropdown of valid single-roll values for the gear profile (e.g. 4–8% for Lv 85 ATK%). SPD ranges are 2–5 for Lv 85 Epic (5 is rare) and 3–5 for Lv 88 Epic. Typing a value directly is still allowed.
- An **Add enhancement roll** box lets you pick a **substat** and a **roll value**, then add the roll. The substat list contains only stats that already have a base value (the 3 or 4 substats the gear rolled with). Each add leaves the base untouched, advances the enhancement level by `+3` and the roll count by one, and updates the score immediately. Added rolls are listed with remove buttons; the row also shows `base → total`.
- Each added roll advances the displayed enhancement level by `+3` and the roll count by one (capped at `+15`). Changing the Enhance buttons rebalances the added rolls to match the selected stage.
- The substat grid has three columns — **Substat**, **Value + Rolls** (base picker, custom value, `+3` chips, and `base → total`), and **Points** — with the total gear score in the footer. Substats with a base value stay grouped at the top in the order their base values were entered (first entered stays topmost); empty substats sit below them in the default order. Setting or clearing a base value moves its row between the groups automatically.

Main stats and set bonuses are ignored entirely. On **Lv 85 Epic only**, a **Flat stats** control (0–3) marks how many of the gear's substats are flat ATK / HP / DEF; their values are irrelevant, only the count matters. Lv 88 ignores flats. A gear with flat stats cannot use a mod gem.

**Score**

Level 85 uses the 8-point system:

```
Score = ATK% + HP% + DEF% + EFF% + ER%
      + SPD × 2
      + Crit Chance% × 1.6
      + Crit Damage% × 8/7
```

Level 88 uses the 10-point system:

```
Score = (ATK% + HP% + DEF% + EFF% + ER%) × 10/9
      + SPD × 2
      + Crit Chance% × 10/6
      + Crit Damage% × 10/8
```

The extended 5-speed roll on Lv 85 Epic uses the normal SPD weight and is worth 10 points. Reachability projections deliberately keep using the standard 8-point maximum for Lv 85 gear (see below).

**Flat stat deduction (Lv 85 only):** flat ATK / HP / DEF substats reduce the score:

```
penalty = 0                                when n = 0
penalty = 8 + (n − 1) × Target / roll      when n ≥ 1
Total   = weighted substat sum − penalty
```

The first flat costs exactly one Lv 85 max roll (8 points) and ignores the editable **Target / roll**; every additional flat costs one Target / roll. With the default 6.08 target, one/two/three flats deduct 8.00 / 14.08 / 20.16 (with a target of 7: 8.00 / 15.00 / 22.00). In reachability, the same penalty is applied to the **Bench** value at every stage:

```
Bench = rolls × Target / roll − penalty
```

The reduced total is the starting point for best-case scores and the reduced Bench is what they are compared against, so both sides drop by the same amount. Lv 88 Epic ignores the flat count. A gear has at most four substat slots, so an error is shown when `flat count + base-valued percentage stats > 4` (the score is still calculated).

**Benchmarks** are cumulative targets, `rolls at stage × target per roll`:

| Profile | Target / roll | Rolls at +0 → +15 | +15 benchmark |
|---|---:|---:|---:|
| Lv 85 Epic | 6.08 | 4 → 9 | 54.72 |
| Lv 88 Epic | 8.04 | 4 → 9 | 72.36 |

The **Target / roll** box in the setup bar edits the benchmark target for the currently selected profile. Each profile keeps its own value (defaults: 6.08 for Lv 85 Epic, 8.04 for Lv 88 Epic), and the value is saved with the rest of the app state. It changes benchmarks and reachability comparisons only — scoring weights and the 8/10-point maximum roll are unaffected. An empty or non-positive value falls back to the default.

**Reachability** is the stage-by-stage calculation. For each enhancement stage:

```
remaining rolls = rolls(stage) − rolls(current stage)
best-case score = current score + remaining rolls × max points per roll
```

A maximum roll is worth **8 points on Lv 85** and **10 points on Lv 88** for every non-flat stat. A stage is reachable when the best-case score is at least that stage's benchmark. Results are shown as `Reachable`, `Not reachable`, `Met`, or `Below`; stages already passed are shown as `—`.

### Substat modification gem (Lv 85 only)

The **Mod gem** control in the reachability panel has three modes: **Off**, **Same stat** (ATK% → ATK%), and **Any stat** (ATK% → any substat not already on the gear). Lv 88 gear ignores the setting.

Gear with one or more flat stats has the mod gem disabled: the buttons are inactive and gem points are zero at every stage.

A Greater gem can only be used on a substat that is still at **one base roll** — no `+3` roll has landed on it. The sheet tracks this per substat at every stage: if a projected roll lands on the gem source, the calculation switches to another eligible substat, or drops the gem gain to zero if none remain. Remaining rolls in the projection are placed on the other substats so the chosen source stays at one base roll.

Best-case reachability includes the extra points from the single best gem use at every stage:

```
best-case score = current score + remaining rolls × max points per roll + gem points
```

Gem points = the highest `(new points − old points)` over all eligible sources and allowed targets, floored at zero. The Greater base-roll maximums ("88 or lower") are pct 8, SPD 4, and CD 7 — each worth 8 points at Lv 85. Crit Chance is excluded as a target because its mod value is 1 lower. A same-stat mod keeps the higher of the old and new values; a target already present on the gear is not allowed (except the same stat itself).

## Run from source

Requires Python 3.11+ and the WebView2 runtime (already present on Windows 11 and most Windows 10 installs).

```powershell
python -m pip install -r requirements.txt
python app.py
```

Pass `--debug` to open developer tools.

## Build the executable

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Output: `dist\E7GearSheet.exe` — this is the only command you need to rebuild; run it again after any change under `web\`. Close a running `E7GearSheet.exe` first, otherwise the rebuild cannot replace it.

The script creates/updates `.venv`, installs PyInstaller and `requirements.txt`, generates `assets\icon.ico`, and bundles the HTML/CSS/JS into a single portable executable. Settings are saved to `%APPDATA%\E7GearSheet\state.json` and are kept across rebuilds.

Windows may warn that the executable is unsigned. Choose **More info → Run anyway** the first time.

## Tests

The scoring and benchmark math lives in `web\calc.js` and is shared by the UI and the tests.

```powershell
node --test tests/calc.test.js
```

`tests\reachability.txt` contains hand-worked examples of the stage-by-stage check.

## Files

- `app.py` — WebView2 window and JSON state bridge
- `web/index.html`, `web/styles.css`, `web/app.js` — spreadsheet UI
- `web/calc.js` — scoring, benchmarks, and reachability logic
- `tests/calc.test.js` — math tests
- `tools/make_icon.py` — icon generator
- `build.ps1` — PyInstaller build script
