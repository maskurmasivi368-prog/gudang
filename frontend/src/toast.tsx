import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

type ToastType = "success" | "error" | "info";
interface ToastItem { id: number; message: string; type: ToastType }

interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}
const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const iconFor = (t: ToastType) =>
    t === "success" ? "check-circle" : t === "error" ? "alert-circle" : "information";
  const colorFor = (t: ToastType) =>
    t === "success" ? colors.success : t === "error" ? colors.error : colors.info;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        {toasts.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInUp}
            exiting={FadeOutUp}
            style={[styles.toast, { borderLeftColor: colorFor(t.type) }]}
          >
            <MaterialDesignIcons name={iconFor(t.type)} size={22} color={colorFor(t.type)} />
            <Text style={styles.text} numberOfLines={2} testID="toast-message">
              {t.message}
            </Text>
          </Animated.View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const useStyles = makeStyles((c) => ({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceTertiary,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  text: { flex: 1, color: c.onSurface, fontFamily: fonts.bodyMedium, fontSize: 14 },
}));
