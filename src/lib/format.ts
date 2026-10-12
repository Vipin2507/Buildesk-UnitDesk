/** 1 lakh = ₹1,00,000 · 1 crore = ₹1,00,00,000 */
const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

function trimDecimals(n: number, digits = 2) {
  return n
    .toFixed(digits)
    .replace(/\.?0+$/, "");
}

/**
 * Format INR for display.
 * - default: full Indian grouping (₹56,50,000)
 * - compact: ₹56.5 L / ₹1.25 Cr (never mislabels lakhs as crores)
 */
export function inr(value?: number | null, compact = false) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (compact && abs >= CRORE) {
    return `${sign}₹${trimDecimals(abs / CRORE)} Cr`;
  }
  if (compact && abs >= LAKH) {
    return `${sign}₹${trimDecimals(abs / LAKH)} L`;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function floorLabel(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n === 0) return "Ground";
  const v = n % 100;
  const suffix =
    v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix} Floor`;
}
