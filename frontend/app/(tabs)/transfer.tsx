import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { TransferDoc, listTransfers } from "@/src/pos";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

type Direction = "outgoing" | "incoming";

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

function stateMeta(colors: ReturnType<typeof useTheme>["colors"], state: string) {
  switch (state) {
    case "draft":
      return { label: "Draf", color: colors.warning, icon: "file-edit-outline" };
    case "shipped":
      return { label: "Dikirim", color: colors.info, icon: "truck-fast" };
    case "receipt_draft":
      return { label: "Dicek", color: colors.info, icon: "clipboard-check-outline" };
    case "partial_received":
      return { label: "Terima Sebagian", color: colors.warning, icon: "clipboard-alert-outline" };
    case "received":
      return { label: "Diterima", color: colors.success, icon: "check-circle" };
    case "cancelled":
      return { label: "Dibatalkan", color: colors.error, icon: "close-circle" };
    default:
      return { label: state, color: colors.muted, icon: "file-outline" };
  }
}

export default function TransferTabScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [direction, setDirection] = useState<Direction>("outgoing");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["pos-transfers", direction],
    queryFn: () => listTransfers(direction),
    enabled: !!user,
  });

  const items = data?.items ?? [];

  const renderItem = ({ item }: { item: TransferDoc }) => {
    const meta = stateMeta(colors, item.state);
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/transfer/${item.id}`)} testID={`transfer-${item.id}`}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.no}>{item.request_no}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.from_store_name} → {item.to_store_name}
            </Text>
            <Text style={styles.date}>{fmtDate(item.created_at)}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialDesignIcons name={meta.icon as never} size={14} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.items}>{item.item_count ?? item.items?.length ?? 0} item</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>TRANSFER</Text>
        <Text style={styles.subtitle}>Antar cabang (kirim & terima)</Text>
      </View>

      <View style={styles.chipRow}>
        {([{ k: "outgoing", l: "Keluar" }, { k: "incoming", l: "Masuk" }] as const).map((c) => {
          const active = direction === c.k;
          return (
            <Pressable key={c.k} onPress={() => setDirection(c.k)} style={[styles.chip, active && styles.chipActive]} testID={`dir-${c.k}`}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.l}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="swap-horizontal" size={56} color={colors.muted} />
              <Text style={styles.emptyTitle}>
                {direction === "outgoing" ? "Belum ada transfer keluar" : "Belum ada transfer masuk"}
              </Text>
            </View>
          }
        />
      )}

      {direction === "outgoing" && (
        <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={() => router.push("/transfer-new")} testID="new-transfer-fab">
          <MaterialDesignIcons name="plus" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.fabText}>Buat Transfer</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: { height: 34, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.xs },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  no: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  meta: { fontFamily: fonts.body, fontSize: 12, color: c.onSurfaceTertiary, marginTop: 2 },
  date: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: c.surfaceTertiary },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11 },
  items: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
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
