import { describe, it, expect } from "vitest";
import {
  winterSolsticeSolarDay,
  longestNightHoursFromLatitude,
  decimalHoursToHHMM,
} from "@/lib/solarNight";

/**
 * Pure astronomy for the winter-solstice sizing references. No network — these
 * pin the formula cos(H) = -tan(φ)·tan(δ) and its derived quantities. Reference
 * numbers cross-checked against the spec (Paris ≈ 8 h day / 16 h night, sunset
 * ≈ 16:01 solar).
 */
describe("solarNight", () => {
  it("equator: 12 h day / 12 h night, sunset at solar 18:00", () => {
    const day = winterSolsticeSolarDay(0);
    expect(day.kind).toBe("normal");
    if (day.kind === "normal") {
      expect(day.dayLengthH).toBeCloseTo(12, 5);
      expect(day.sunsetSolarH).toBeCloseTo(18, 5);
    }
    expect(longestNightHoursFromLatitude(0)).toBeCloseTo(12, 5);
  });

  it("Paris (48.85°): ~8 h day, ~15.97 h night, sunset ~16:01 solar", () => {
    const day = winterSolsticeSolarDay(48.85);
    expect(day.kind).toBe("normal");
    if (day.kind === "normal") {
      expect(day.dayLengthH).toBeCloseTo(8.03, 2);
      expect(day.sunsetSolarH).toBeCloseTo(16.02, 2);
      expect(decimalHoursToHHMM(day.sunsetSolarH)).toBe("16:01");
    }
    expect(longestNightHoursFromLatitude(48.85)).toBeCloseTo(15.97, 2);
  });

  it("high latitude beyond the 16 h slider bound (Berlin 52.52° ≈ 16.6 h night)", () => {
    expect(longestNightHoursFromLatitude(52.52)).toBeCloseTo(16.59, 1);
  });

  it("polar cases: sun never rises / never sets above the Arctic circle", () => {
    // cos(H) > 1 → polar night; cos(H) < -1 → polar day (mirror latitude).
    expect(winterSolsticeSolarDay(80).kind).toBe("polar_night");
    expect(longestNightHoursFromLatitude(80)).toBe(24);
    expect(winterSolsticeSolarDay(-80).kind).toBe("polar_day");
    expect(longestNightHoursFromLatitude(-80)).toBe(0);
  });

  it("formats decimal hours to HH:MM, wrapping past midnight", () => {
    expect(decimalHoursToHHMM(16.5)).toBe("16:30");
    expect(decimalHoursToHHMM(0)).toBe("00:00");
    expect(decimalHoursToHHMM(24.25)).toBe("00:15");
    expect(decimalHoursToHHMM(-0.5)).toBe("23:30");
  });
});
