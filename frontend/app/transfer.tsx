import React, { useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, ApiError, Transfer } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const fmtDate = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TransferListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.get<Transfer[]>("/transfers"),
  });

  const act = async (id: string, action: "receive" | "cancel") => {
    setBusyId(id);
    try {
      await api.post(`/transfers/${id}/${action}`);
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.show(action === "receive" ? "Transfer diterima, stok masuk" : "Transfer dibatalkan", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally {
      setBusyId(null);
    }
  };

  const statusMeta = (s: Transfer["status"]) =>
    s === "received"
      ? { label: "Diterima", color: colors.success, icon: "check-circle" }
      : s === "cancelled"
        ? { label: "Dibatalkan", color: colors.error, icon: "close-circle" }
        : { label: "Dikirim", color: colors.warning, icon: "truck-fast" };

  const renderItem = ({ item }: { item: Transfer }) => {
    const meta = statusMeta(item.status);
    return (
      <View style={styles.card} testID={`transfer-${item.id}`}>
        <View style={styles.route}>
          <View style={styles.routeCol}>
            <Text style={styles.routeLabel}>DARI</Text>
            <Text style={styles.routeName} numberOfLines={1}>{item.from_branch_name}</Text>
          </View>
          <MaterialDesignIcons name="arrow-right-bold" size={22} color={colors.brandPrimary} />
          <View style={styles.routeCol}>
            <Text style={styles.routeLabel}>KE</Text>
            <Text style={styles.routeName} numberOfLines={1}>{item.to_branch_name}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: colors.surfaceTertiary }]}>
            <MaterialDesignIcons name={meta.icon as never} size={14} color={meta.color} />
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.metaText}>{item.total_qty} qty • {item.items.length} item</Text>
          <Text style={styles.metaDate}>{fmtDate(item.created_at)}</Text>
        </View>
        {item.status === "pending" && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actBtn, { backgroundColor: colors.brandPrimary }]}
              onPress={() => act(item.id, "receive")}
              disabled={busyId === item.id}
              testID={`receive-${item.id}`}
            >
              {busyId === item.id ? (
                <ActivityIndicator color={colors.onBrandPrimary} size="small" />
              ) : (
                <Text style={[styles.actText, { color: colors.onBrandPrimary }]}>Konfirmasi Terima</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.actBtn, styles.cancelBtn]}
              onPress={() => act(item.id, "cancel")}
              disabled={busyId === item.id}
              testID={`cancel-${item.id}`}
            >
              <Text style={[styles.actText, { color: colors.error }]}>Batal</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="TRANSFER CABANG" subtitle="Kirim & terima antar cabang" />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="swap-horizontal" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada transfer</Text>
            </View>
          }
        />
      )}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => router.push("/transfer-new")}
        testID="new-transfer-fab"
      >
        <MaterialDesignIcons name="plus" size={24} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Buat Transfer</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.md },
  route: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  routeCol: { flex: 1 },
  routeLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  routeName: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: c.onSurfaceTertiary },
  metaDate: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginLeft: "auto" },
  actions: { flexDirection: "row", gap: spacing.sm },
  actBtn: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cancelBtn: { flex: 0.5, borderWidth: 1.5, borderColor: c.error },
  actText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  fab: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: c.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 56,
  },
  fabText: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onBrandPrimary },
}));
