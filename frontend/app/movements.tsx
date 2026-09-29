import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, Movement } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const fmtDate = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const TYPES = [
  { key: "", label: "Semua" },
  { key: "receive", label: "Terima" },
  { key: "transfer_in", label: "Transfer Masuk" },
  { key: "transfer_out", label: "Transfer Keluar" },
  { key: "issue", label: "Keluar" },
  { key: "opname", label: "Opname" },
];

const META: Record<string, { icon: string; label: string }> = {
  receive: { icon: "package-down", label: "Terima" },
  transfer_in: { icon: "call-received", label: "Transfer Masuk" },
  transfer_out: { icon: "call-made", label: "Transfer Keluar" },
  issue: { icon: "package-up", label: "Barang Keluar" },
  opname: { icon: "clipboard-check", label: "Opname" },
};

export default function MovementsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["movements", type],
    queryFn: () => api.get<Movement[]>(`/movements?limit=200${type ? `&mtype=${type}` : ""}`),
  });

  const renderItem = ({ item }: { item: Movement }) => {
    const meta = META[item.type] ?? { icon: "swap-vertical", label: item.type };
    const positive = item.qty >= 0;
    return (
      <View style={styles.row} testID={`movement-${item.id}`}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceTertiary }]}>
          <MaterialDesignIcons name={meta.icon as never} size={20} color={positive ? colors.success : colors.error} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta.label} • {item.branch_name}</Text>
          <Text style={styles.date}>{fmtDate(item.created_at)}{item.user_name ? ` • ${item.user_name}` : ""}</Text>
        </View>
        <Text style={[styles.qty, { color: positive ? colors.success : colors.error }]}>
          {positive ? "+" : ""}{item.qty}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="LAPORAN STOK" subtitle="Riwayat pergerakan stok" />
      <View style={styles.chipWrap}>
        <FlatList
          data={TYPES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(t) => t.key || "all"}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => {
            const active = type === item.key;
            return (
              <Pressable onPress={() => setType(item.key)} style={[styles.chip, active && styles.chipActive]} testID={`mtype-${item.key || "all"}`}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="history" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada pergerakan</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipWrap: { height: 48, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.divider },
  chipsContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: { height: 32, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  meta: { fontFamily: fonts.body, fontSize: 12, color: c.onSurfaceTertiary, marginTop: 1 },
  date: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginTop: 1 },
  qty: { fontFamily: fonts.display, fontSize: 21 },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
}));
