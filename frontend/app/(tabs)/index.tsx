import React, { useEffect } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { Batch, listBatches } from "@/src/pos";
import { useAuth } from "@/src/auth";
import { flushQueue } from "@/src/journal";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

function stateMeta(colors: ReturnType<typeof useTheme>["colors"], state: string) {
  switch (state) {
    case "draft":
      return { label: "Draf", color: colors.warning, icon: "file-edit-outline" };
    case "purchase_pending":
      return { label: "Audit Pembelian", color: colors.info, icon: "clock-outline" };
    case "purchased":
      return { label: "Selesai", color: colors.success, icon: "check-circle" };
    case "cancelled":
      return { label: "Dibatalkan", color: colors.error, icon: "close-circle" };
    default:
      return { label: state, color: colors.muted, icon: "file-outline" };
  }
}

export default function ReceivingListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // Flush any queued mutations when the tab opens (offline recovery).
  useEffect(() => {
    if (user) flushQueue(user.id, user.store_id).catch(() => {});
  }, [user]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["pos-batches"],
    queryFn: () => listBatches(),
    enabled: !!user,
  });

  const renderItem = ({ item }: { item: Batch }) => {
    const meta = stateMeta(colors, item.state);
    const totalQty = (item.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/batch/${item.id}`)} testID={`batch-${item.id}`}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.supplier} numberOfLines={1}>{item.supplier_name || "Tanpa supplier"}</Text>
            <Text style={styles.meta}>
              {item.reference ? `${item.reference} • ` : ""}{fmtDate(item.updated_at)}
            </Text>
          </View>
          <View style={styles.badge}>
            <MaterialDesignIcons name={meta.icon as never} size={14} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Text style={styles.statValue}>{(item.items ?? []).length}</Text>
          <Text style={styles.statLabel}>item</Text>
          <Text style={styles.statValue}>{totalQty}</Text>
          <Text style={styles.statLabel}>qty</Text>
          <MaterialDesignIcons name="chevron-right" size={22} color={colors.muted} style={{ marginLeft: "auto" }} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>PENERIMAAN</Text>
          <Text style={styles.subtitle}>Draf penerimaan barang (POS)</Text>
        </View>
        <View style={styles.storePill}>
          <MaterialDesignIcons name="warehouse" size={14} color={colors.brandPrimary} />
          <Text style={styles.storePillText} numberOfLines={1}>{user?.name ?? ""}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="package-down" size={56} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada penerimaan</Text>
              <Text style={styles.emptySub}>Buat penerimaan baru lalu mulai scan barcode</Text>
            </View>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => router.push("/batch-new")}
        testID="new-batch-fab"
      >
        <MaterialDesignIcons name="plus" size={22} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Penerimaan Baru</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  storePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 160,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  storePillText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: c.onSurface },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  supplier: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: c.surfaceTertiary },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11 },
  stats: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statValue: { fontFamily: fonts.display, fontSize: 19, color: c.onSurface },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center" },
  fab: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: c.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  fabText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onBrandPrimary },
}));
