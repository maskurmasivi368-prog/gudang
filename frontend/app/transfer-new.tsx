import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import {
  PosError,
  PosStore,
  TransferDoc,
  TransferProduct,
  UnitConv,
  transferOptions,
  transferSearch,
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

interface CartItem { product_id: string; name: string; unit: string; pieces: number; qty: number; units: UnitConv[] }

export default function TransferNewScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [dest, setDest] = useState<PosStore | null>(null);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [creating, setCreating] = useState(false);
  const [pickDest, setPickDest] = useState(false);
  const [unitPick, setUnitPick] = useState<{ product: TransferProduct; forItem?: string } | null>(null);
  const [results, setResults] = useState<TransferProduct[] | null>(null);

  // Stable context for this draft session's scan-notes.
  const contextId = useRef(uuid());

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const optionsQuery = useQuery({
    queryKey: ["transfer-options"],
    queryFn: () => transferOptions(),
    enabled: !!user,
  });
  const destinations = (optionsQuery.data?.stores ?? []).filter(
    (s) => s.id !== optionsQuery.data?.active_store,
  );

  const addProduct = useCallback(
    (product: TransferProduct, unit: UnitConv) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.product_id === product.id);
        if (idx >= 0) {
          const existing = prev[idx];
          if (existing.unit !== unit.name) {
            toast.show(`${product.name} sudah ada dengan satuan ${existing.unit}`, "error");
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...existing, qty: existing.qty + 1 };
          return copy;
        }
        return [
          { product_id: product.id, name: product.name, unit: unit.name, pieces: unit.pieces, qty: 1, units: product.units },
          ...prev,
        ];
      });
      toast.show(`${product.name} +1 ${unit.name}`, "success");
    },
    [toast],
  );

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        // Hardware scan: hanya tepat satu hasil exact yang langsung dipakai.
        const res = await transferSearch(code);
        const exact = res.filter((p) => p.exact);
        if (exact.length === 1 && res.length === 1) {
          const p = exact[0];
          const unit = (p.units ?? []).find((u) => u.name === p.matched_unit);
          if (unit) addProduct(p, unit);
          else if ((p.units ?? []).length > 0) setUnitPick({ product: p });
          else addProduct(p, { name: "PCS", pieces: 1 });
        } else if (res.length > 0) {
          setResults(res);
        } else {
          // Tidak ditemukan → catatan transfer untuk admin, bukan produk baru.
          await postScanNote({
            kind: "transfer",
            context_id: contextId.current,
            barcode: code,
            document_id: null,
            target_store: dest?.id ?? null,
          });
          toast.show(`Barcode ${code} belum terdaftar — dicatat untuk admin`, "info");
        }
      } catch (e) {
        toast.show((e as PosError).message, "error");
      }
    },
    [addProduct, toast, dest],
  );

  useEffect(() => scanBus.subscribe((c) => handleCode(c)), [handleCode]);

  const onSubmitBarcode = () => {
    if (!barcode.trim()) return;
    handleCode(barcode);
    setBarcode("");
  };

  const pickResult = (p: TransferProduct) => {
    setResults(null);
    const unit = (p.units ?? []).find((u) => u.name === p.matched_unit);
    if (unit) addProduct(p, unit);
    else if ((p.units ?? []).length > 0) setUnitPick({ product: p });
    else addProduct(p, { name: "PCS", pieces: 1 });
  };

  const changeQty = (productId: string, d: number) =>
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, qty: Math.max(0, i.qty + d) } : i)).filter((i) => i.qty > 0));
  const setQty = (productId: string, v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, qty: isNaN(n) ? 0 : n } : i)));
  };

  const create = async () => {
    if (!user) return;
    if (!dest) { toast.show("Pilih cabang tujuan", "error"); return; }
    const clean = items.filter((i) => i.qty > 0);
    if (clean.length === 0) { toast.show("Belum ada item", "error"); return; }
    setCreating(true);
    try {
      const doc = await mutate<TransferDoc>(user.id, user.store_id, "branch-transfers", "POST", {
        request_id: uuid(),
        revision: 0,
        to_store: dest.id,
        note: note.trim(),
        items: clean.map((i) => ({ product_id: i.product_id, qty: i.qty, unit: i.unit, pieces: i.pieces })),
      });
      queryClient.invalidateQueries({ queryKey: ["pos-transfers"] });
      toast.show("Draf transfer dibuat (stok direservasi)", "success");
      router.replace(`/transfer/${doc.id}`);
    } catch (e) {
      const err = e as PosError;
      toast.show(err.network ? "Offline: gagal membuat. Coba saat koneksi kembali." : err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const totalBase = items.reduce((s, i) => s + i.qty * i.pieces, 0);

  return (
    <View style={styles.root}>
      <ScreenHeader title="BUAT TRANSFER" subtitle="Draf mereservasi stok pengirim" />
      <View style={styles.controls}>
        <Pressable style={styles.select} onPress={() => setPickDest(true)} testID="pick-destination">
          <MaterialDesignIcons name="store-outline" size={20} color={colors.brandPrimary} />
          <Text style={styles.selectText} numberOfLines={1}>{dest ? dest.name : "Pilih cabang tujuan"}</Text>
          <MaterialDesignIcons name="chevron-down" size={20} color={colors.muted} />
        </Pressable>
        <ScanInput value={barcode} onChangeText={setBarcode} onSubmit={onSubmitBarcode} onCamera={() => router.push("/scan")} />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Catatan (opsional)"
          placeholderTextColor={colors.muted}
          style={styles.noteInput}
          testID="transfer-note-input"
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.product_id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={styles.row} testID={`t-item-${item.product_id}`}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.qty} {item.unit} = {item.qty * item.pieces} dasar</Text>
              <Pressable style={styles.unitChip} onPress={() => setUnitPick({ product: { id: item.product_id, name: item.name, units: item.units, matched_unit: null }, forItem: item.product_id })} testID={`t-unit-${item.product_id}`}>
                <Text style={styles.unitChipText}>{item.unit} ({item.pieces})</Text>
                <MaterialDesignIcons name="swap-vertical" size={14} color={colors.brandPrimary} />
              </Pressable>
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => changeQty(item.product_id, -1)} style={styles.stepBtn}><MaterialDesignIcons name="minus" size={20} color={colors.onSurface} /></Pressable>
              <TextInput value={String(item.qty)} onChangeText={(v) => setQty(item.product_id, v)} keyboardType="number-pad" style={styles.qtyInput} testID={`t-qty-${item.product_id}`} />
              <Pressable onPress={() => changeQty(item.product_id, 1)} style={styles.stepBtn}><MaterialDesignIcons name="plus" size={20} color={colors.onSurface} /></Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Scan barcode barang yang akan ditransfer</Text>}
      />

      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL DASAR</Text>
            <Text style={styles.totalValue}>{totalBase}</Text>
          </View>
          <Button title="BUAT DRAF TRANSFER" onPress={create} loading={creating} icon="send" testID="create-transfer-button" style={{ flex: 1 }} />
        </View>
      )}

      {/* Destination picker */}
      <Modal visible={pickDest} transparent animationType="slide" onRequestClose={() => setPickDest(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickDest(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Cabang Tujuan</Text>
          {optionsQuery.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {destinations.map((s) => (
                <Pressable key={s.id} style={styles.sheetRow} onPress={() => { setDest(s); setPickDest(false); }} testID={`dest-${s.id}`}>
                  <MaterialDesignIcons name="store-outline" size={20} color={colors.brandPrimary} />
                  <Text style={styles.sheetRowText}>{s.name}</Text>
                </Pressable>
              ))}
              {destinations.length === 0 && <Text style={styles.empty}>Tidak ada cabang lain</Text>}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Ambiguous search results */}
      <Modal visible={results !== null} transparent animationType="slide" onRequestClose={() => setResults(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setResults(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Pilih Produk</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {(results ?? []).map((p) => (
              <Pressable key={p.id} style={styles.sheetRow} onPress={() => pickResult(p)} testID={`result-${p.id}`}>
                <MaterialDesignIcons name="cube-outline" size={20} color={colors.brandPrimary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sheetRowText} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.sheetRowMeta}>stok tersedia: {p.stock ?? "-"}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Unit picker */}
      <Modal visible={unitPick !== null} transparent animationType="slide" onRequestClose={() => setUnitPick(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setUnitPick(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Pilih Satuan</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {(unitPick?.product.units ?? []).map((u) => (
              <Pressable
                key={u.name}
                style={styles.sheetRow}
                onPress={() => {
                  if (!unitPick) return;
                  if (unitPick.forItem) {
                    setItems((prev) => prev.map((i) => (i.product_id === unitPick.forItem ? { ...i, unit: u.name, pieces: u.pieces } : i)));
                  } else {
                    addProduct(unitPick.product, u);
                  }
                  setUnitPick(null);
                }}
                testID={`unit-option-${u.name}`}
              >
                <MaterialDesignIcons name="package-variant" size={20} color={colors.brandPrimary} />
                <Text style={styles.sheetRowText}>{u.name}</Text>
                <Text style={styles.sheetRowMeta}>{u.pieces} pcs</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  controls: { padding: spacing.lg, gap: spacing.sm },
  select: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48 },
  selectText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: c.onSurface },
  noteInput: { backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: c.onSurface, fontFamily: fonts.body, fontSize: 14 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  unitChip: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", backgroundColor: c.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: spacing.xs },
  unitChipText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.onBrandTertiary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qtyInput: { width: 46, textAlign: "center", color: c.onSurface, fontFamily: fonts.display, fontSize: 20, paddingVertical: 0 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center", paddingTop: spacing["2xl"], paddingHorizontal: spacing.xl },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  totalBox: { alignItems: "center" },
  totalLabel: { fontFamily: fonts.body, fontSize: 9, color: c.muted },
  totalValue: { fontFamily: fonts.display, fontSize: 24, color: c.brandPrimary },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface, marginBottom: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  sheetRowText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  sheetRowMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
}));
