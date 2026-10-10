/** Minimal RFC4180-ish CSV parse/stringify (no extra deps). */

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = splitCsvLines(normalized);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvRow(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitCsvRow(line);
    const row: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = (cells[c] ?? "").trim();
      row[key] = val;
      if (val) any = true;
    }
    if (any) rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      lines.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n") + "\n";
}

export function cell(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const direct = row[k];
    if (direct != null && String(direct).trim() !== "") return String(direct).trim();
    const lower = k.toLowerCase();
    for (const [rk, rv] of Object.entries(row)) {
      if (rk.toLowerCase() === lower && String(rv).trim() !== "") return String(rv).trim();
    }
  }
  return "";
}

export function num(row: Record<string, string>, ...keys: string[]): number | null {
  const raw = cell(row, ...keys);
  if (!raw) return null;
  const n = Number(String(raw).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function dateIso(row: Record<string, string>, ...keys: string[]): string | null {
  const raw = cell(row, ...keys);
  if (!raw) return null;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
