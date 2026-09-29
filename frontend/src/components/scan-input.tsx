import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

interface ScanInputProps {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onCamera?: () => void;
  placeholder?: string;
  testID?: string;
}

/**
 * Barcode field tuned for PDA laser scanners: the on-screen keyboard stays
 * hidden (showSoftInputOnFocus=false) so the hardware scanner types directly,
 * with a small keyboard icon to enable manual typing when needed.
 */
export function ScanInput({
  value,
  onChangeText,
  onSubmit,
  onCamera,
  placeholder = "Scan / ketik barcode",
  testID = "barcode-input",
}: ScanInputProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [keyboardOn, setKeyboardOn] = useState(false);

  return (
    <View style={styles.row}>
      <View style={styles.inputWrap}>
        <MaterialDesignIcons name="barcode" size={22} color={colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          showSoftInputOnFocus={keyboardOn}
          style={styles.input}
          testID={testID}
        />
        <Pressable
          onPress={() => setKeyboardOn((k) => !k)}
          hitSlop={8}
          testID="barcode-keyboard-toggle"
        >
          <MaterialDesignIcons
            name={keyboardOn ? "keyboard" : "keyboard-off"}
            size={22}
            color={keyboardOn ? colors.brandPrimary : colors.muted}
          />
        </Pressable>
        {value.length > 0 && (
          <Pressable onPress={onSubmit} hitSlop={8} testID="barcode-add-button">
            <MaterialDesignIcons name="plus-circle" size={26} color={colors.brandPrimary} />
          </Pressable>
        )}
      </View>
      {onCamera && (
        <Pressable style={styles.camBtn} onPress={onCamera} testID="open-camera-button">
          <MaterialDesignIcons name="camera" size={26} color={colors.onBrandPrimary} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: spacing.sm },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: { flex: 1, color: c.onSurface, fontFamily: fonts.body, fontSize: 15 },
  camBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
