import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PdfSubmissionDocument from "@/components/PdfSubmissionDocument";
import {
  defaultForm,
  defaultLightingSetup,
  createDefaultZoneLightingData,
  SoluxForm,
} from "@/types/solux";

/**
 * Phase 1 anchor test: the PDF document is the product, so it must contain
 * every value the user entered. This file pins the CURRENTLY-rendered fields
 * (green baseline). During Phase 1 we extend it with the fields that are
 * presently dropped (per-zone product/battery, road luminaire/power,
 * roadSegmentLighting, zone name instead of UUID) — each new assertion drives
 * a fix.
 *
 * Note: we omit `apiKey` so the Google Maps preview never loads in jsdom.
 */

const text = (form: SoluxForm) =>
  render(
    <PdfSubmissionDocument form={form} salesName="alice" nowStr="2026-01-01 10:00" lang="en" />,
  ).container.textContent ?? "";

describe("PdfSubmissionDocument", () => {
  it("renders general info and product for a zone project", () => {
    const form: SoluxForm = {
      ...defaultForm,
      projectName: "Test Project",
      clientName: "ACME Corp",
      locality: "Paris",
      country: "France",
      projectType: "zone",
      locationMode: "pdf", // avoid the map branch
      product: "SSLXPRO",
      avgLux: "20",
      cct: "4000K",
      assignedArea: "zone-1",
      zoneLightingData: {
        "zone-1": { ...createDefaultZoneLightingData(), avgLux: "20", cct: "4000K" },
      },
    };
    const out = text(form);
    expect(out).toContain("LIGHTING STUDY REQUEST");
    expect(out).toContain("Test Project");
    expect(out).toContain("ACME Corp");
    expect(out).toContain("SOLUX PRO"); // PRODUCT_LABELS[SSLXPRO]
    expect(out).toContain("20"); // avgLux
  });

  it("renders road profile and lighting config for a road project", () => {
    const form: SoluxForm = {
      ...defaultForm,
      projectName: "Road Project",
      clientName: "RoadCo",
      projectType: "road",
      locationMode: "pdf",
      product: "SSLXPRO",
      roadProfile: [{ id: "s1", type: "lane", width: 3.5, direction: "forward" }],
      roadLighting: { ...defaultLightingSetup },
    };
    const out = text(form);
    expect(out).toContain("Road Project");
    expect(out).toContain("RoadCo");
    expect(out).toContain("Road Profile");
    expect(out).toContain("Road Lighting Configuration");
  });
});
