import React from "react";
import { Text, Pressable, ActivityIndicator, View, StyleProp, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "danger"
        ? colors.error
        : variant === "secondary"
          ? colors.surfaceTertiary
          : "transparent";
  const fg =
    variant === "primary"
      ? colors.onBrandPrimary
      : variant === "danger"
        ? colors.onError
        : colors.onSurface;

  const handle = () => {
    if (isDisabled) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "ghost" && styles.ghost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <IconGlyph name={icon} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

// avoid circular import weight; small inline icon
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
function IconGlyph({ name, color }: { name: string; color: string }) {
  return <MaterialDesignIcons name={name as never} size={22} color={color} />;
}

const useStyles = makeStyles((c) => ({
  btn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  ghost: { borderWidth: 1.5, borderColor: c.borderStrong },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fonts.bodySemi, fontSize: 15 },
}));
