import React from "react";
import { View, Text, Pressable, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { Branch } from "@/src/api";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

interface BranchPickerProps {
  visible: boolean;
  branches: Branch[];
  currentId?: string | null;
  disabledId?: string | null;
  title?: string;
  onSelect: (b: Branch) => void;
  onClose: () => void;
}

export function BranchPicker({
  visible,
  branches,
  currentId,
  disabledId,
  title = "Pilih Cabang",
  onSelect,
  onClose,
}: BranchPickerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
          style={{ maxHeight: 380 }}
          renderItem={({ item }) => {
            const active = item.id === currentId;
            const disabled = item.id === disabledId;
            return (
              <Pressable
                style={[styles.row, disabled && styles.rowDisabled]}
                onPress={() => !disabled && onSelect(item)}
                disabled={disabled}
                testID={`branch-option-${item.id}`}
              >
                <MaterialDesignIcons
                  name={item.is_main ? "warehouse" : "store-outline"}
                  size={22}
                  color={disabled ? colors.muted : colors.brandPrimary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, disabled && { color: colors.muted }]}>{item.name}</Text>
                  {item.code ? <Text style={styles.code}>{item.code}</Text> : null}
                </View>
                {active && <MaterialDesignIcons name="check-circle" size={22} color={colors.success} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada cabang</Text>}
        />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  title: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  rowDisabled: { opacity: 0.5 },
  name: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  code: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  empty: { fontFamily: fonts.body, fontSize: 14, color: c.muted, paddingVertical: spacing.lg },
}));
