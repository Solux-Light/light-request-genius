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
      productFamily: "SSLX Pro",
      product: "SSLX Pro 60",
      avgLux: "20",
      cct: "4000K",
      areas: [{ id: "zone-1", type: "polygon", paths: [], color: "#2563eb", name: "Parking Nord" }],
      assignedArea: "zone-1",
      zoneLightingData: {
        "zone-1": { ...createDefaultZoneLightingData(), avgLux: "20", cct: "4000K", productFamily: "SSLX Pro", product: "SSLX Pro 60" },
      },
    };
    const out = text(form);
    expect(out).toContain("LIGHTING STUDY REQUEST");
    expect(out).toContain("Test Project");
    expect(out).toContain("ACME Corp");
    expect(out).toContain("Parking Nord"); // zone name, not the raw UUID (Phase 1)
    expect(out).toContain("SSLX Pro"); // product FAMILY (two-level hierarchy)
    expect(out).toContain("SSLX Pro 60"); // product MODEL inside the family
    expect(out).toContain("20"); // avgLux
  });

  it("migrates a legacy single-field product id and never fabricates a zone", () => {
    // A draft saved before the family→model split stores "SSLXPRO"; the PDF
    // must resolve it to the family with the model marked as to-be-defined.
    const form: SoluxForm = {
      ...defaultForm,
      projectName: "Legacy Project",
      clientName: "ACME Corp",
      projectType: "zone",
      locationMode: "pdf",
      avgLux: "15",
      product: "SSLXPRO",
    };
    const out = text(form);
    expect(out).toContain("SSLX Pro"); // migrated family
    expect(out).toContain("To be defined by the Study Lab"); // model pending
    // With no zone drawn, the typed levels print as project-level targets —
    // never as an invented "Zone" row.
    expect(out).toContain("Project (no zone drawn)");
    // And the document must not promise a KML that doesn't exist.
    expect(out).not.toContain("accompanies this request");
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
