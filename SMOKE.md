# Smoke checklist — Solux Study Lab

Quick manual pass to run after any change, in the running dev app (`npm run dev`, http://localhost:8080).
Goal: catch regressions in the two core flows and the PDF deliverable before committing.

## 0b. Persistence & recovery (overnight batch)

- [ ] Fill fields → wait ~1s → reload: a "draft found" banner appears; **Restore** brings everything back, **Discard** clears it.
- [ ] Try to close the tab with unsaved edits → browser shows the leave-confirmation.
- [ ] Header **Projects** menu: Save current project → reload/Discard → open it from the list; Delete removes it.
- [ ] After a successful submit, the draft is cleared and the leave-warning stops.

## 0c. Validation (mode-aware)

- [ ] Zone: requires address, avg lux, CCT, product.
- [ ] Road **Builder**: requires only the 4 general fields (no address, no global product).
- [ ] Road **PDF Profile**: requires a document + a product (or "recommend") per profile; **no** global address/product. Profiles with no levels show a soft nudge on submit but don't block.

## 0. Environment

- [ ] `.env.local` exists (copied from `.env.example`) with real keys.
- [ ] Dev server **restarted** after any `.env*` change (Vite reads env only at startup).
- [ ] Map loads (no "Carte non disponible") → `VITE_GOOGLE_MAPS_API_KEY` is set.

## 1. Zone flow (Area Lighting)

- [ ] Fill General Information (project, client, locality, country).
- [ ] Project type = **Area Lighting**.
- [ ] Map tab: search an address, draw a zone (lasso), drop a lamppost, rotate it.
- [ ] PDF tab: upload a PDF plan, draw a zone on it.
- [ ] Numbered steps 1–8 flow top-to-bottom (road mode renumbers itself 1–7 with no gaps).
- [ ] "Study Area & Lighting Levels" (one merged step): pick a zone, set Average Illuminance / CCT.
- [ ] Product Selection: choose a product, height (Fixed/Range), spacing, battery, panel.
- [ ] Lighting Program: SAME compact table module as profiles (direct inputs, Fit badge, thin preview) — no timeline editor, no sliders anywhere.
- [ ] **Export PDF** → every value entered above is present in the PDF.

## 2. Road flow (Road & Street lighting)

- [ ] Project type = **Road**.
- [ ] Road Builder: add segments, reorder (drag), mirror, set widths/directions.
- [ ] Road Lighting Layout: arrangement, pole height (toggle **Fixed/Range** → range prints "min–max m (range)" in the PDF), arm, tilt, spacing, luminaire, power mode.
- [ ] Per-segment lighting levels: set lux/uniformity/CCT for each segment type.
- [ ] **Export PDF** → road profile, lighting config (incl. luminaire/power), and per-segment levels all present.

## 2b. Road flow — Work From PDF Profile (5-step workflow)

- [ ] Step 1: drag-drop several files (PDF/PNG/JPG/DWG) → auto-named "Profile 1/2/…"; first new profile auto-selected.
- [ ] Step 2: profile list → clicking a row (or a Project Summary row) switches the config panel; values are fully independent between profiles.
- [ ] Step 3: Lighting Levels **table** (Segment | Avg Lux | Min Lux | Uniformity | **MF** | Class EN 13201 | Notes) — add/remove sections, edit inline.
- [ ] Multi-sections: "Add Cross-Section Profile" on a file group → new independent profile sharing the same drawing (levels/config/program/notes empty; plan identical; deleting one section keeps the drawing for the others).
- [ ] Step 4: Requested Product — Product Family = product RANGE (SSLX Performance, SSLX Pro, AOS…), model select disabled until a family is chosen, then filtered to that family (catalogue = `PRODUCT_FAMILIES` in types/solux.ts).
- [ ] Step 4 optimize: every installation parameter (height, arrangement, spacing, overhang, tilt) defaults to **Optimize** (Study Lab); unchecking reveals the manual input (height also supports Fixed/Range). PDF prints "Optimize (Study Lab)" for optimized fields. **No optic field**.
- [ ] "Let the Study Lab recommend the best product" checkbox: hides family/model; summary + PDF show "Study Lab recommendation".
- [ ] Desktop layout: content container is max-w-7xl (~1280px) — check the form breathes on widescreen.
- [ ] Step 5: Lighting Program — **compact table editor** (direct numeric inputs: night/morning hours, per-period mode/hours/power/boost/detections, thin timeline preview, "Fit" when periods ≠ night − morning). Fully per-profile: edit one profile's program, switch profiles → others unchanged. Per-profile notes below.
- [ ] "Copy levels from…" (≥2 profiles): copies levels by segment TYPE (Main Road → Main Road…), updates matches, appends missing kinds, leaves target-only kinds untouched.
- [ ] In this mode the global "Lighting Scenario" section and the PDF "Lighting Programming" block are hidden (each profile prints its own program).
- [ ] Sticky context header: scroll deep into a profile → "📍 <Profile> → <Section>" stays pinned at top (updates to the section whose row you focus).
- [ ] Map (Area Lighting): container is 640px tall (comfortable drawing).
- [ ] One Lighting Program: only LightingProgramTable exists (zone, road builder, profiles); Morning Time present in all three. Multi-product's per-zone field is "Scenario notes" (a free note, not a second program).
- [ ] PDF: zone levels render as horizontal tables (Zone | Avg | Min | U₀ | CCT | Night | 🌅 Morning) + a requested-product table, scannable at a glance; Morning Time appears even with no zone drawn.
- [ ] Plan hidden by default → "Show plan" opens the annotation viewer (lasso/markers/zoom identical to Area Lighting).
- [ ] With ≥2 profiles: "Project Summary" table (Profile | Road Segments | Requested Product | Height | Program).
- [ ] **Export PDF** → summary table (if ≥2), then per profile: requested product block (no optic) + lighting-levels table + profile notes.

## 2c. Lighting program extras (zone + road)

- [ ] Morning Time: set duration → striped 🌅 block at the END of the timeline; periods re-normalise to (night − morning); appears in the PDF.
- [ ] Sensor period: Boost duration + Estimated detections selects → both printed in the PDF program lines.

## 2d. Google Earth

- [ ] With a project location set: **Google Earth (KML)** button downloads a KML (zones + lampposts open in Google Earth).
- [ ] Exported PDF has a "Google Earth" section; the earth.google.com link is clickable in the generated PDF.

## 3. Multi-product

- [ ] Toggle "Multiple Products" on.
- [ ] Add an assignment, pick zone + product, fill lux/CCT/scenario/presence.
- [ ] **Export PDF** → each assignment and its fields are present.

## 4. PDF export robustness

- [ ] PDF Preview modal renders the document.
- [ ] Exported PDF paginates correctly (multi-page) and the map preview is not blank/black.
- [ ] Filename = slugified project name.

## Automated

- [ ] `npm test` is green.
