# Smoke checklist — Solux Study Lab

Quick manual pass to run after any change, in the running dev app (`npm run dev`, http://localhost:8080).
Goal: catch regressions in the two core flows and the PDF deliverable before committing.

## 0. Environment

- [ ] `.env.local` exists (copied from `.env.example`) with real keys.
- [ ] Dev server **restarted** after any `.env*` change (Vite reads env only at startup).
- [ ] Map loads (no "Carte non disponible") → `VITE_GOOGLE_MAPS_API_KEY` is set.

## 1. Zone flow (Area Lighting)

- [ ] Fill General Information (project, client, locality, country).
- [ ] Project type = **Area Lighting**.
- [ ] Map tab: search an address, draw a zone (lasso), drop a lamppost, rotate it.
- [ ] PDF tab: upload a PDF plan, draw a zone on it.
- [ ] "Assigned Study Area": pick a zone, set Average Illuminance / CCT.
- [ ] Product Selection: choose a product, height, spacing, battery, panel.
- [ ] Lighting Scenario: drag a segment handle, change night duration.
- [ ] **Export PDF** → every value entered above is present in the PDF.

## 2. Road flow (Road & Street lighting)

- [ ] Project type = **Road**.
- [ ] Road Builder: add segments, reorder (drag), mirror, set widths/directions.
- [ ] Road Lighting Layout: arrangement, pole height, arm, tilt, spacing, luminaire, power mode.
- [ ] Per-segment lighting levels: set lux/uniformity/CCT for each segment type.
- [ ] **Export PDF** → road profile, lighting config (incl. luminaire/power), and per-segment levels all present.

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
