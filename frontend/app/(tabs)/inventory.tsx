import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, Product } from "@/src/api";
import { useBranch } from "@/src/branch";
import { BranchPicker } from "@/src/components/branch-picker";
import { useTheme, makeStyles, spacing, radius, fonts } from "@/src/theme";

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export default function InventoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const { branches, current, setCurrentId } = useBranch();
  const [picker, setPicker] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["products", current?.id],
    queryFn: () => api.get<Product[]>(`/products${current?.id ? `?branch_id=${current.id}` : ""}`),
    enabled: !!current,
  });

  const filtered = (data ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search),
  );

  const branchStockTotal = (data ?? []).reduce((s, p) => s + (p.branch_stock ?? 0), 0);

  const renderItem = ({ item }: { item: Product }) => {
    const bStock = item.branch_stock ?? 0;
    const low = bStock <= 5;
    return (
      <View style={styles.row} testID={`product-${item.barcode}`}>
        <View style={styles.rowIcon}>
          <MaterialDesignIcons name="cube-outline" size={22} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.rowBarcode}>{item.barcode}</Text>
          <Text style={styles.rowPrice}>Modal {rupiah(item.cost)} • Jual {rupiah(item.price)} • Total {item.stock}</Text>
        </View>
        <View style={styles.stockBox}>
          <Text style={[styles.stockValue, { color: low ? colors.warning : colors.onSurface }]}>{bStock}</Text>
          <Text style={styles.stockLabel}>stok</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>STOK POS</Text>
            <Pressable style={styles.branchChip} onPress={() => setPicker(true)} testID="inventory-branch-chip">
              <MaterialDesignIcons name="warehouse" size={16} color={colors.brandPrimary} />
              <Text style={styles.branchChipText} numberOfLines={1}>{current?.name ?? "Cabang"}</Text>
              <MaterialDesignIcons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.totalPill}>
            <Text style={styles.totalPillValue}>{branchStockTotal}</Text>
            <Text style={styles.totalPillLabel}>Unit di sini</Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <MaterialDesignIcons name="magnify" size={22} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama / barcode"
            placeholderTextColor={colors.muted}
            style={styles.search}
            autoCapitalize="none"
            testID="inventory-search"
          />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="package-variant" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada produk</Text>
            </View>
          }
        />
      )}

      <BranchPicker
        visible={picker}
        branches={branches}
        currentId={current?.id}
        onSelect={(b) => {
          setCurrentId(b.id);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    maxWidth: 200,
    marginTop: spacing.xs,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  branchChipText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurface },
  totalPill: { alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: c.border },
  totalPillValue: { fontFamily: fonts.display, fontSize: 20, color: c.brandPrimary },
  totalPillLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  search: { flex: 1, color: c.onSurface, fontFamily: fonts.body, fontSize: 15 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowBarcode: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  rowPrice: { fontFamily: fonts.body, fontSize: 12, color: c.onSurfaceTertiary, marginTop: 2 },
  stockBox: { alignItems: "center", minWidth: 40 },
  stockValue: { fontFamily: fonts.display, fontSize: 22 },
  stockLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
}));
