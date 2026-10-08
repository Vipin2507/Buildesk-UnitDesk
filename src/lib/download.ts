export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
) {
  const body = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([[header.join(","), body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function inlinePresentation(source: Element, target: Element) {
  const attrs = [
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-opacity",
    "fill-opacity",
    "opacity",
    "font-size",
    "font-family",
    "font-weight",
    "color",
  ] as const;
  const cs = getComputedStyle(source);
  for (const attr of attrs) {
    const value = cs.getPropertyValue(attr);
    if (!value || value === "none" || value === "normal") continue;
    // Skip default transparent / inherited noise
    if (attr === "fill" && (value === "rgb(0, 0, 0)" || value === "rgba(0, 0, 0, 0)")) {
      const raw = source.getAttribute("fill");
      if (raw && raw !== "none") target.setAttribute("fill", raw.includes("var(") ? value : raw);
      continue;
    }
    if (source.hasAttribute(attr) || ["fill", "stroke", "font-size", "font-family"].includes(attr)) {
      const raw = source.getAttribute(attr);
      if (raw?.includes("var(") || !raw) target.setAttribute(attr, value);
    }
  }
  const srcChildren = [...source.children];
  const tgtChildren = [...target.children];
  for (let i = 0; i < srcChildren.length; i += 1) {
    const s = srcChildren[i];
    const t = tgtChildren[i];
    if (s && t) inlinePresentation(s, t);
  }
}

function serializeSvg(svg: SVGSVGElement, background: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlinePresentation(svg, clone);
  const bbox = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(bbox.width || Number(svg.getAttribute("width")) || 640));
  const height = Math.max(1, Math.round(bbox.height || Number(svg.getAttribute("height")) || 320));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", background);
  clone.insertBefore(bg, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  return { xml, width, height };
}

/** Download the first SVG chart inside a container as PNG or SVG. */
export async function downloadChartElement(
  container: HTMLElement | null,
  filename: string,
  format: "png" | "svg" = "png",
) {
  if (!container) throw new Error("Chart not ready");
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("No chart graphic found");

  const background = readCssVar("--card", "#ffffff");
  const base = slugify(filename) || "chart";
  const { xml, width, height } = serializeSvg(svg, background);

  if (format === "svg") {
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, `${base}.svg`);
    return;
  }

  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
    });
    triggerDownload(png, `${base}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download every `[data-chart-export]` chart currently on the page. */
export async function downloadAllCharts(format: "png" | "svg" = "png") {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-chart-export]")];
  if (!nodes.length) throw new Error("No charts visible — switch to Charts or Split view");
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    const title = el.dataset.chartTitle || `chart-${i + 1}`;
    await downloadChartElement(el, title, format);
    // Brief gap so browsers don't collapse rapid downloads
    if (i < nodes.length - 1) await new Promise((r) => setTimeout(r, 180));
  }
  return nodes.length;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render chart image"));
    img.src = url;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
