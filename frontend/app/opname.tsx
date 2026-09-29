import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, Opname } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const fmtDate = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OpnameListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["opnames"],
    queryFn: () => api.get<Opname[]>("/opnames"),
  });

  const renderItem = ({ item }: { item: Opname }) => {
    const open = expanded === item.id;
    return (
      <Pressable style={styles.card} onPress={() => setExpanded(open ? null : item.id)} testID={`opname-${item.id}`}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.branch}>{item.branch_name}</Text>
            <Text style={styles.meta}>oleh {item.created_by_name} • {fmtDate(item.created_at)}</Text>
          </View>
          <View style={[styles.diffBadge, { backgroundColor: colors.surfaceTertiary }]}>
            <Text style={[styles.diffValue, { color: item.total_diff === 0 ? colors.muted : item.total_diff > 0 ? colors.success : colors.error }]}>
              {item.total_diff > 0 ? "+" : ""}{item.total_diff}
            </Text>
            <Text style={styles.diffLabel}>selisih</Text>
          </View>
          <MaterialDesignIcons name={open ? "chevron-up" : "chevron-down"} size={24} color={colors.muted} />
        </View>
        {open && (
          <View style={styles.detail}>
            {item.items.map((it) => {
              const diffColor = it.diff === 0 ? colors.muted : it.diff > 0 ? colors.success : colors.error;
              return (
                <View key={it.barcode} style={styles.detailRow}>
                  <Text style={styles.detailName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.detailNums}>
                    <Text style={{ color: colors.muted }}>{it.system_qty}</Text>
                    {" → "}
                    <Text style={{ color: colors.onSurface }}>{it.physical_qty}</Text>
                    {"  "}
                    <Text style={{ color: diffColor }}>({it.diff > 0 ? "+" : ""}{it.diff})</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="STOK OPNAME" subtitle="Riwayat & penyesuaian fisik" />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="clipboard-list-outline" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada opname</Text>
            </View>
          }
        />
      )}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={() => router.push("/opname-new")} testID="new-opname-fab">
        <MaterialDesignIcons name="plus" size={24} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Opname Baru</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  branch: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  diffBadge: { alignItems: "center", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 4 },
  diffValue: { fontFamily: fonts.display, fontSize: 22 },
  diffLabel: { fontFamily: fonts.body, fontSize: 9, color: c.muted },
  detail: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.divider, gap: spacing.sm },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  detailName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary },
  detailNums: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  fab: { position: "absolute", right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 56 },
  fabText: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onBrandPrimary },
}));
