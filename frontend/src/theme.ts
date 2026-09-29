// Design tokens — Dark-First Utility (industrial PDA warehouse app).
// Keys match the "color" block of /app/design_guidelines.json.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121212",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1E1E1E",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#2C2C2C",
  onSurfaceTertiary: "#CCCCCC",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#888888",

  brand: "#FF6B00",
  onBrand: "#000000",
  brandPrimary: "#FF6B00",
  onBrandPrimary: "#000000",
  brandSecondary: "#CC5500",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#331600",
  onBrandTertiary: "#FF8C33",

  success: "#00E676",
  onSuccess: "#000000",
  warning: "#FFD600",
  onWarning: "#000000",
  error: "#FF3B30",
  onError: "#FFFFFF",
  info: "#1D4ED8",
  onInfo: "#FFFFFF",

  border: "#333333",
  borderStrong: "#555555",
  divider: "#222222",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// This app ships a single dark scheme; force it so native chrome matches.
setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  void system;
  return { scheme: "dark", colors: themes.dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Shared design constants ---------------------------------------------------
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;

export const fonts = {
  display: "BarlowCondensed-Bold",
  displaySemi: "BarlowCondensed-SemiBold",
  body: "IBMPlexSans-Regular",
  bodyMedium: "IBMPlexSans-Medium",
  bodySemi: "IBMPlexSans-SemiBold",
} as const;
