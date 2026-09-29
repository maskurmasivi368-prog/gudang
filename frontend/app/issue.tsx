import React from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, Issue } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const fmtDate = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function IssueListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["issues"],
    queryFn: () => api.get<Issue[]>("/issues"),
  });

  const renderItem = ({ item }: { item: Issue }) => (
    <View style={styles.card} testID={`issue-${item.id}`}>
      <View style={styles.cardTop}>
        <View style={styles.reasonBadge}>
          <MaterialDesignIcons name="package-up" size={16} color={colors.warning} />
          <Text style={styles.reasonText}>{item.reason}</Text>
        </View>
        <Text style={styles.date}>{fmtDate(item.created_at)}</Text>
      </View>
      <Text style={styles.branch}>{item.branch_name} • oleh {item.created_by_name}</Text>
      <View style={styles.stats}>
        <Text style={styles.statValue}>{item.total_qty}</Text>
        <Text style={styles.statLabel}>total qty keluar ({item.items.length} item)</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="BARANG KELUAR" subtitle="Pengeluaran stok gudang" />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="package-up" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada pengeluaran</Text>
            </View>
          }
        />
      )}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={() => router.push("/issue-new")} testID="new-issue-fab">
        <MaterialDesignIcons name="plus" size={24} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Barang Keluar</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reasonBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  reasonText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurface },
  date: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  branch: { fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceTertiary },
  stats: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  statValue: { fontFamily: fonts.display, fontSize: 26, color: c.warning },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  fab: { position: "absolute", right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 56 },
  fabText: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onBrandPrimary },
}));
