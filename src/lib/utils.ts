import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Deep-clone plain JSON-able data. Used so module-level default objects
// (defaultForm, defaultLightingSetup, …) are never shared by reference between
// projects — a shallow spread copies only the top level and would leak nested
// arrays/objects between forms.
export const deepClone = <T>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

// crypto.randomUUID is undefined on non-secure origins (plain HTTP behind a
// LAN/reverse proxy) — fall back to a v4-shaped id so the app never crashes
// on its very first interaction there.
export const uid = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
