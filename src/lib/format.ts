export function inr(value?: number | null, compact = false) {
  if (value == null || Number.isNaN(value)) return "—";
  if (compact && Math.abs(value) >= 10_00_000) {
    return `₹${(value / 10_00_000).toFixed(2)} Cr`;
  }
  if (compact && Math.abs(value) >= 1_00_000) {
    return `₹${(value / 1_00_000).toFixed(2)} L`;
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
