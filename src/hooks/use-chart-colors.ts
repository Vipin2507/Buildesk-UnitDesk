import { useEffect, useState } from "react";
import { useThemeStore } from "@/stores/theme";

export function useChartColors() {
  const theme = useThemeStore((s) => s.theme);
  const [colors, setColors] = useState<string[]>([
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ]);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setColors(
      [1, 2, 3, 4, 5].map((i) => styles.getPropertyValue(`--chart-${i}`).trim()),
    );
  }, [theme]);

  return colors;
}
