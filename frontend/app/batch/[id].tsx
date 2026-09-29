import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import {
  Batch,
  BatchItem,
  PosError,
  ProductScan,
  UnitConv,
  getBatch,
  scanProduct,
  searchProducts,
  getProductById,
  postScanNote,
  uuid,
} from "@/src/pos";
import { mutate } from "@/src/journal";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { ScanInput } from "@/src/components/scan-input";
import { ScreenHeader } from "@/src/components/screen-header";
import { scanBus } from "@/src/scanBus";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

interface EditableItem extends BatchItem {
  product_name: string;
}

export default function BatchDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // unit picker state: which product is being unit-chosen
  const [unitPick, setUnitPick] = useState<{ product: ProductScan; forItem?: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<ProductScan[]>([]);
  const [searching, setSearching] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const editable = batch?.state === "draft";

  const { isLoading } = useQuery({
    queryKey: ["pos-batch", id],
    queryFn: async () => {
      const b = await getBatch(id!);
      setBatch(b);
      setReference(b.reference || "");
      setNote(b.note || "");
      setItems(
        (b.items ?? []).map((i) => ({
          ...i,
          product_name: i.product_name ?? i.barcode ?? i.product_id,
        })),
      );
      setDirty(false);
      return b;
    },
    enabled: !!user && !!id,
  });

  const addProduct = useCallback(
    (product: ProductScan, unit: UnitConv) => {
      if (!editable) return;
      setDirty(true);
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.product_id === product.id);
        if (idx >= 0) {
          const existing = prev[idx];
          if (existing.unit !== unit.name) {
            toast.show(
              `${product.name} sudah ada dengan satuan ${existing.unit}. Hapus dulu bila ingin ganti satuan.`,
              "error",
            );
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...existing, quantity: existing.quantity + 1 };
          return copy;
        }
        const line: EditableItem = {
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode ?? "",
          base_unit: product.base_unit,
          units: product.units,
          quantity: 1,
          unit: unit.name,
          pieces: unit.pieces,
          condition: "SESUAI",
          variant: product.matched_variant ?? null,
        };
        return [line, ...prev];
      });
      toast.show(`${product.name} +1 ${unit.name}`, "success");
    },
    [editable, toast],
  );

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !editable || !batch) return;
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        const product = await scanProduct(code);
        const units = product.units ?? [];
        const matched = units.find((u) => u.name === product.matched_unit);
        if (matched) {
          addProduct(product, matched);
        } else if (units.length > 0) {
          // matched_unit kosong (pencarian nama/ambigu): minta pilih satuan sah
          setUnitPick({ product });
        } else {
          addProduct(product, { name: product.base_unit, pieces: 1 });
        }
      } catch (e) {
        const err = e as PosError;
        if (err.status === 404) {
          // Barcode belum terdaftar: catat untuk admin, JANGAN buat produk/stok.
          try {
            await postScanNote({
              kind: "warehouse",
              context_id: batch.id,
              barcode: code,
              document_id: batch.id,
              target_store: null,
            });
            toast.show(`Barcode ${code} belum terdaftar — dicatat untuk admin`, "info");
          } catch (ne) {
            toast.show((ne as PosError).message || "Gagal mencatat barcode", "error");
          }
        } else if (err.status === 409) {
          toast.show("Konflik data, muat ulang draf", "error");
          queryClient.invalidateQueries({ queryKey: ["pos-batch", id] });
        } else {
          toast.show(err.message, "error");
        }
      }
    },
    [editable, batch, addProduct, toast, queryClient, id],
  );

  useEffect(() => scanBus.subscribe((c) => handleCode(c)), [handleCode]);

  const onSubmitBarcode = () => {
    if (!barcode.trim()) return;
    handleCode(barcode);
    setBarcode("");
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await searchProducts(q);
      setSearchResults(res.items ?? []);
    } catch (e) {
      toast.show((e as PosError).message, "error");
    } finally {
      setSearching(false);
    }
  };

  const pickSearchResult = async (p: ProductScan) => {
    setSearchOpen(false);
    setSearchQ("");
    setSearchResults([]);
    try {
      const full = await getProductById(p.id);
      const units = full.units ?? [];
      const matched = units.find((u) => u.name === full.matched_unit);
      if (matched) addProduct(full, matched);
      else if (units.length > 0) setUnitPick({ product: full });
      else addProduct(full, { name: full.base_unit, pieces: 1 });
    } catch (e) {
      toast.show((e as PosError).message, "error");
    }
  };

  const changeQty = (productId: string, delta: number) => {
    setDirty(true);
    setItems((prev) =>
      prev
        .map((i) => (i.product_id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0),
    );
  };

  const setQty = (productId: string, v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    setDirty(true);
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity: isNaN(n) ? 0 : n } : i)),
    );
  };

  const removeItem = (productId: string) => {
    setDirty(true);
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const changeUnit = (productId: string, unit: UnitConv) => {
    setDirty(true);
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, unit: unit.name, pieces: unit.pieces } : i)),
    );
    setUnitPick(null);
  };

  const save = async () => {
    if (!user || !batch || !editable) return;
    setSaving(true);
    try {
      // PUT selalu mengirim SELURUH items dengan revision terakhir dari server.
      const saved = await mutate<Batch>(user.id, user.store_id, `warehouse/batches/${batch.id}`, "PUT", {
        request_id: uuid(),
        revision: batch.revision,
        reference: reference.trim(),
        note: note.trim(),
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit: i.unit,
          pieces: i.pieces,
          condition: i.condition,
          variant: i.variant ?? null,
        })),
      });
      setBatch(saved);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["pos-batches"] });
      toast.show(`Draf tersimpan (rev ${saved.revision})`, "success");
    } catch (e) {
      const err = e as PosError;
      if (err.status === 409) {
        toast.show("Konflik: draf berubah di tempat lain. Dimuat ulang.", "error");
        queryClient.invalidateQueries({ queryKey: ["pos-batch", id] });
      } else if (err.network) {
        toast.show("Offline: draf masuk antrean, dikirim otomatis saat online", "info");
      } else {
        toast.show(err.message, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const totalBase = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.pieces, 0),
    [items],
  );

  if (isLoading || !batch) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={batch.supplier_name || "PENERIMAAN"}
        subtitle={`${batch.reference || "tanpa referensi"} • ${batch.state.toUpperCase()} • rev ${batch.revision}`}
        right={
          editable ? (
            <Pressable style={styles.searchBtn} onPress={() => setSearchOpen(true)} testID="search-product-button">
              <MaterialDesignIcons name="magnify" size={24} color={colors.brandPrimary} />
            </Pressable>
          ) : undefined
        }
      />

      {editable && (
        <View style={styles.controls}>
          <ScanInput
            value={barcode}
            onChangeText={setBarcode}
            onSubmit={onSubmitBarcode}
            onCamera={() => router.push("/scan")}
          />
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.product_id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={styles.row} testID={`item-${item.product_id}`}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.product_name}</Text>
              <Text style={styles.rowMeta}>
                {item.barcode ? `${item.barcode} • ` : ""}{item.quantity} {item.unit} = {item.quantity * item.pieces} {item.base_unit}
              </Text>
              {editable && (
                <Pressable
                  style={styles.unitChip}
                  onPress={() => {
                    if (!item.units || item.units.length === 0) return;
                    setUnitPick({
                      product: {
                        id: item.product_id,
                        name: item.product_name,
                        barcode: item.barcode,
                        base_unit: item.base_unit ?? "PCS",
                        units: item.units,
                        variants: [],
                        matched_unit: null,
                      },
                      forItem: item.product_id,
                    });
                  }}
                  testID={`unit-${item.product_id}`}
                >
                  <Text style={styles.unitChipText}>{item.unit} ({item.pieces})</Text>
                  <MaterialDesignIcons name="swap-vertical" size={14} color={colors.brandPrimary} />
                </Pressable>
              )}
            </View>
            {editable ? (
              <View style={styles.stepper}>
                <Pressable onPress={() => changeQty(item.product_id, -1)} style={styles.stepBtn} testID={`minus-${item.product_id}`}>
                  <MaterialDesignIcons name="minus" size={20} color={colors.onSurface} />
                </Pressable>
                <TextInput
                  value={String(item.quantity)}
                  onChangeText={(v) => setQty(item.product_id, v)}
                  keyboardType="number-pad"
                  style={styles.qtyInput}
                  testID={`qty-${item.product_id}`}
                />
                <Pressable onPress={() => changeQty(item.product_id, 1)} style={styles.stepBtn} testID={`plus-${item.product_id}`}>
                  <MaterialDesignIcons name="plus" size={20} color={colors.onSurface} />
                </Pressable>
                <Pressable onPress={() => removeItem(item.product_id)} style={styles.removeBtn} testID={`remove-${item.product_id}`}>
                  <MaterialDesignIcons name="trash-can-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialDesignIcons name="barcode-scan" size={56} color={colors.muted} />
            <Text style={styles.emptyTitle}>Belum ada item</Text>
            <Text style={styles.emptySub}>
              {editable ? "Scan barcode atau cari produk untuk menambah" : "Draf ini tidak berisi item"}
            </Text>
          </View>
        }
      />

      {editable && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL DASAR</Text>
            <Text style={styles.totalValue} testID="total-base">{totalBase}</Text>
            {dirty && <Text style={styles.dirtyText}>belum disimpan</Text>}
          </View>
          <Button
            title={dirty ? "SIMPAN DRAF" : "TERSIMPAN"}
            onPress={save}
            loading={saving}
            disabled={!dirty}
            icon="content-save"
            testID="save-batch-button"
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* Unit picker sheet */}
      <Modal visible={unitPick !== null} transparent animationType="slide" onRequestClose={() => setUnitPick(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setUnitPick(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Pilih Satuan</Text>
          <Text style={styles.sheetSub}>{unitPick?.product.name}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {(unitPick?.product.units ?? []).map((u) => (
              <Pressable
                key={u.name}
                style={styles.sheetRow}
                onPress={() => {
                  if (!unitPick) return;
                  if (unitPick.forItem) changeUnit(unitPick.forItem, u);
                  else addProduct(unitPick.product, u);
                  setUnitPick(null);
                }}
                testID={`unit-option-${u.name}`}
              >
                <MaterialDesignIcons name="package-variant" size={20} color={colors.brandPrimary} />
                <Text style={styles.sheetRowText}>{u.name}</Text>
                <Text style={styles.sheetRowMeta}>{u.pieces} {unitPick?.product.base_unit}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Manual product search sheet */}
      <Modal visible={searchOpen} transparent animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSearchOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Cari Produk</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              onSubmitEditing={runSearch}
              placeholder="Nama produk"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoFocus
              testID="search-product-input"
            />
            <Pressable onPress={runSearch} style={styles.searchGo} testID="search-product-go">
              {searching ? (
                <ActivityIndicator size="small" color={colors.onBrandPrimary} />
              ) : (
                <MaterialDesignIcons name="magnify" size={22} color={colors.onBrandPrimary} />
              )}
            </Pressable>
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(p) => p.id}
            style={{ maxHeight: 300 }}
            renderItem={({ item }) => (
              <Pressable style={styles.sheetRow} onPress={() => pickSearchResult(item)} testID={`result-${item.id}`}>
                <MaterialDesignIcons name="cube-outline" size={20} color={colors.brandPrimary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sheetRowText} numberOfLines={1}>{item.name}</Text>
                  {item.barcode ? <Text style={styles.sheetRowMeta}>{item.barcode}</Text> : null}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptySub}>Ketik nama lalu cari</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center" },
  searchBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  controls: { padding: spacing.lg, paddingBottom: spacing.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  unitChip: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", backgroundColor: c.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: spacing.xs },
  unitChipText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.onBrandTertiary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qtyInput: { width: 46, textAlign: "center", color: c.onSurface, fontFamily: fonts.display, fontSize: 20, paddingVertical: 0 },
  removeBtn: { padding: spacing.xs },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center", paddingHorizontal: spacing.xl },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  totalBox: { alignItems: "center" },
  totalLabel: { fontFamily: fonts.body, fontSize: 9, color: c.muted },
  totalValue: { fontFamily: fonts.display, fontSize: 24, color: c.brandPrimary },
  dirtyText: { fontFamily: fonts.body, fontSize: 10, color: c.warning },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  sheetSub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, marginBottom: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  sheetRowText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  sheetRowMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  searchRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  searchInput: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: c.onSurface, fontFamily: fonts.body, fontSize: 15, borderWidth: 1.5, borderColor: c.border },
  searchGo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
