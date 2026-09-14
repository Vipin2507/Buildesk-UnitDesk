import { cn } from "@/lib/cn";

type IsoTone = {
  bg: string;
  wall: string;
  wallDark: string;
  floor: string;
  accent: string;
  stroke: string;
};

const tones: Record<string, IsoTone> = {
  available: {
    bg: "#e8f8ee",
    wall: "#b6ebc8",
    wallDark: "#7ed49a",
    floor: "#d5f5e1",
    accent: "#1f9d4d",
    stroke: "#15803d",
  },
  booked: {
    bg: "#e8f3ff",
    wall: "#b7d8ff",
    wallDark: "#7eb6f5",
    floor: "#d6eaff",
    accent: "#1d7fe0",
    stroke: "#1d4ed8",
  },
  sold: {
    bg: "#ffe8ee",
    wall: "#ffb7c5",
    wallDark: "#f4879c",
    floor: "#ffd6df",
    accent: "#e11d48",
    stroke: "#be123c",
  },
  hold: {
    bg: "#fff6e5",
    wall: "#fdd89a",
    wallDark: "#f0b84d",
    floor: "#ffe9c2",
    accent: "#d97706",
    stroke: "#b45309",
  },
  blocked: {
    bg: "#e8f7ff",
    wall: "#b3e4ff",
    wallDark: "#6fc8f5",
    floor: "#d4f0ff",
    accent: "#009bff",
    stroke: "#0284c7",
  },
  not_available: {
    bg: "#f1f5f9",
    wall: "#d0d7e0",
    wallDark: "#a8b3c0",
    floor: "#e2e8f0",
    accent: "#64748b",
    stroke: "#475569",
  },
};

/** Compact isometric room glyph tinted by unit status. */
export function UnitIsoIcon({
  status,
  className,
  size = 28,
}: {
  status: string;
  className?: string;
  size?: number;
}) {
  const tone = tones[status] ?? tones.not_available;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md", className)}
      style={{ width: size, height: size, background: tone.bg }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size * 0.86} height={size * 0.86} fill="none">
        <path
          d="M20 30 L8 23 L20 16 L32 23 Z"
          fill={tone.floor}
          stroke={tone.stroke}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path
          d="M8 23 L8 14 L20 7 L20 16 Z"
          fill={tone.wall}
          stroke={tone.stroke}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path
          d="M20 16 L20 7 L32 14 L32 23 Z"
          fill={tone.wallDark}
          stroke={tone.stroke}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path d="M12.2 20.5 L12.2 15.2 L16.2 12.9 L16.2 18.2 Z" fill={tone.accent} opacity="0.9" />
        <path
          d="M24 13.5 L28.5 16.1 L28.5 19.2 L24 16.6 Z"
          fill="#fff"
          opacity="0.85"
          stroke={tone.stroke}
          strokeWidth="0.5"
        />
        <path
          d="M20 30 L11 25.2 L11 26.4 L20 31.2 L29 26.4 L29 25.2 Z"
          fill={tone.accent}
          opacity="0.55"
        />
        <path
          d="M13.5 26.4 V28.2 M17 28.2 V30 M23 28.2 V30 M26.5 26.4 V28.2"
          stroke={tone.stroke}
          strokeWidth="0.7"
          strokeLinecap="round"
        />
        <path d="M8 14 L20 7 L32 14" stroke={tone.stroke} strokeWidth="0.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
