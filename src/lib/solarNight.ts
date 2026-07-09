// Winter-solstice sunset & longest-night calculations.
//
// Purpose: from a project's latitude we derive the two worst-case sizing
// references — the LONGEST NIGHT of the year (max consumption) and the SUNSET
// TIME at the winter solstice (when the lighting program must start).
//
// Physics (simplified spherical astronomy, valid for 21 December, N hemisphere):
//   φ = latitude, δ = solar declination (fixed at the solstice = -23.44°)
//   Sunrise/sunset hour angle H solves:   cos(H) = -tan(φ)·tan(δ)
//   Day length = 2H, converted to hours with the factor 12/π (π rad = 12 h of
//   Earth rotation). Sunset (solar) = solar noon (12:00) + dayLength/2.
//
// Simplifications (same as the reference spec): equation of time (±~16 min) and
// atmospheric refraction (~+3 min) are ignored; declination is fixed to the
// solstice value.

export const WINTER_SOLSTICE_DECLINATION_DEG = -23.44;

const deg2rad = (d: number) => (d * Math.PI) / 180;
const mod24 = (h: number) => ((h % 24) + 24) % 24;

// cos(H) = -tan(φ)·tan(δ). |value| > 1 means the sun never crosses the horizon.
const sunsetHourAngleCos = (latDeg: number) =>
  -Math.tan(deg2rad(latDeg)) * Math.tan(deg2rad(WINTER_SOLSTICE_DECLINATION_DEG));

export type SolarDay =
  | { kind: "normal"; dayLengthH: number; sunsetSolarH: number }
  | { kind: "polar_day" } // above the Arctic circle in summer logic → sun never sets (cosH < -1)
  | { kind: "polar_night" }; // above the Arctic circle at the solstice → sun never rises (cosH > 1)

export const winterSolsticeSolarDay = (latDeg: number): SolarDay => {
  const cosH = sunsetHourAngleCos(latDeg);
  if (cosH < -1) return { kind: "polar_day" };
  if (cosH > 1) return { kind: "polar_night" };
  const hourAngle = Math.acos(cosH); // H, in radians
  const dayLengthH = (2 * hourAngle * 12) / Math.PI; // day runs from -H to +H around solar noon
  const sunsetSolarH = 12 + dayLengthH / 2; // solar noon + half the day
  return { kind: "normal", dayLengthH, sunsetSolarH };
};

// Longest night of the year (winter solstice) = 24 − day length.
export const longestNightHoursFromLatitude = (latDeg: number): number => {
  const day = winterSolsticeSolarDay(latDeg);
  if (day.kind === "polar_day") return 0;
  if (day.kind === "polar_night") return 24;
  return 24 - day.dayLengthH;
};

// Decimal hours (may be outside 0-24) → "HH:MM" on a 24 h clock.
export const decimalHoursToHHMM = (h: number): string => {
  const totalMinutes = Math.round(mod24(h) * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// --- Google Web Service helpers (used to turn a city into a legal-time sunset) ---

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";

export type LatLng = { lat: number; lng: number };

// City / address → coordinates. Only the latitude matters for the astronomy;
// the longitude is used for the solar→legal time conversion. Returns null on any
// failure (bad query, network, API not enabled) so callers can fall back.
export const geocodeCity = async (
  query: string,
  apiKey: string,
): Promise<{ location: LatLng; formatted: string } | null> => {
  if (!apiKey || !query.trim()) return null;
  try {
    const res = await fetch(`${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`);
    const data = await res.json();
    const first = data.results?.[0];
    if (!first?.geometry?.location) return null;
    return {
      location: { lat: first.geometry.location.lat, lng: first.geometry.location.lng },
      formatted: first.formatted_address ?? query,
    };
  } catch {
    return null;
  }
};

// Total UTC offset (hours) at the given instant, via the Google Time Zone API.
// rawOffset = standard offset, dstOffset = extra DST seconds (0 in December for
// the N hemisphere). Returns null on failure so callers fall back to solar time.
const fetchUtcOffsetHours = async (
  loc: LatLng,
  timestampSec: number,
  apiKey: string,
): Promise<number | null> => {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${TIMEZONE_URL}?location=${loc.lat},${loc.lng}&timestamp=${timestampSec}&key=${apiKey}`,
    );
    const data = await res.json();
    if (data.status !== "OK") return null;
    return (data.rawOffset + data.dstOffset) / 3600;
  } catch {
    return null;
  }
};

export type DuskResult = {
  hhmm: string;
  basis: "legal" | "solar";
  longestNightH: number;
};

// Winter-solstice sunset for a location. Returns legal (clock) time when the
// Time Zone API is reachable, otherwise raw solar time. Conversion:
//   local solar time  −lng/15 (→ UTC)  +utcOffset (→ clock time).
export const resolveWinterSolsticeDusk = async (
  loc: LatLng,
  apiKey: string,
  solsticeYear: number,
): Promise<DuskResult> => {
  const day = winterSolsticeSolarDay(loc.lat);
  const longestNightH = longestNightHoursFromLatitude(loc.lat);

  if (day.kind === "polar_day") return { hhmm: "12:00", basis: "solar", longestNightH };
  if (day.kind === "polar_night") return { hhmm: "18:00", basis: "solar", longestNightH };

  const solarSunsetH = day.sunsetSolarH;
  // The instant we ask the offset for: 21 December, 12:00 UTC of the reference year.
  const timestampSec = Math.floor(Date.UTC(solsticeYear, 11, 21, 12, 0, 0) / 1000);
  const offsetH = await fetchUtcOffsetHours(loc, timestampSec, apiKey);

  if (offsetH === null) {
    return { hhmm: decimalHoursToHHMM(solarSunsetH), basis: "solar", longestNightH };
  }
  const legalH = solarSunsetH - loc.lng / 15 + offsetH;
  return { hhmm: decimalHoursToHHMM(legalH), basis: "legal", longestNightH };
};
