import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { api, ApiError, Product } from "@/src/api";
import { useToast } from "@/src/toast";
import { useBranch } from "@/src/branch";
import { Button } from "@/src/ui";
import { ScanInput } from "@/src/components/scan-input";
import { ScreenHeader } from "@/src/components/screen-header";
import { BranchPicker } from "@/src/components/branch-picker";
import { scanBus } from "@/src/scanBus";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

interface CartItem { barcode: string; name: string; qty: number }
const REASONS = ["Rusak", "Kadaluarsa", "Sampel", "Pemakaian Internal", "Hilang", "Lainnya"];

export default function IssueNewScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { branches, current } = useBranch();

  const [branch, setBranch] = useState(current);
  const [reason, setReason] = useState(REASONS[0]);
  const [items, setItems] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickBranch, setPickBranch] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addToCart = useCallback((code: string, name: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.barcode === code);
      if (idx >= 0) { const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + 1 }; return c; }
      return [{ barcode: code, name, qty: 1 }, ...prev];
    });
  }, []);

  const handleCode = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const existing = itemsRef.current.find((i) => i.barcode === code);
    if (existing) { addToCart(code, existing.name); toast.show(`${existing.name} +1`, "success"); return; }
    try {
      const p = await api.get<Product>(`/products/barcode/${code}`);
      addToCart(code, p.name);
      toast.show(`${p.name} ditambahkan`, "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setPending(code); setNewName(""); }
      else toast.show("Gagal memuat produk", "error");
    }
  }, [addToCart, toast]);

  useEffect(() => scanBus.subscribe((c) => handleCode(c)), [handleCode]);

  const onSubmitBarcode = () => { if (!barcode.trim()) return; handleCode(barcode); setBarcode(""); };
  const changeQty = (code: string, d: number) =>
    setItems((prev) => prev.map((i) => (i.barcode === code ? { ...i, qty: Math.max(0, i.qty + d) } : i)).filter((i) => i.qty > 0));
  const setQty = (code: string, v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    setItems((prev) => prev.map((i) => (i.barcode === code ? { ...i, qty: isNaN(n) ? 0 : n } : i)));
  };

  const submit = async () => {
    if (!branch) { toast.show("Pilih cabang", "error"); return; }
    const clean = items.filter((i) => i.qty > 0);
    if (clean.length === 0) { toast.show("Belum ada item", "error"); return; }
    setSubmitting(true);
    try {
      await api.post("/issues", {
        branch_id: branch.id, reason,
        items: clean.map((i) => ({ barcode: i.barcode, name: i.name, qty: i.qty })),
      });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.show("Barang keluar dicatat, stok berkurang", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/issue");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally { setSubmitting(false); }
  };

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return (
    <View style={styles.root}>
      <ScreenHeader title="BARANG KELUAR" subtitle="Catat pengeluaran stok" />
      <View style={styles.controls}>
        <View style={styles.rowBtns}>
          <Pressable style={styles.selectBtn} onPress={() => setPickBranch(true)} testID="issue-branch">
            <MaterialDesignIcons name="warehouse" size={18} color={colors.brandPrimary} />
            <Text style={styles.selectText} numberOfLines={1}>{branch?.name ?? "Cabang"}</Text>
          </Pressable>
        </View>
        <FlatList
          data={REASONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(r) => r}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => {
            const active = reason === item;
            return (
              <Pressable onPress={() => setReason(item)} style={[styles.chip, active && styles.chipActive]} testID={`reason-${item}`}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </Pressable>
            );
          }}
        />
        <ScanInput value={barcode} onChangeText={setBarcode} onSubmit={onSubmitBarcode} onCamera={() => router.push("/scan")} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.barcode}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={styles.itemRow} testID={`issue-item-${item.barcode}`}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowBarcode}>{item.barcode}</Text>
            </View>
            <Pressable onPress={() => changeQty(item.barcode, -1)} style={styles.stepBtn}><MaterialDesignIcons name="minus" size={22} color={colors.onSurface} /></Pressable>
            <TextInput value={String(item.qty)} onChangeText={(v) => setQty(item.barcode, v)} keyboardType="number-pad" style={styles.qtyInput} testID={`i-qty-${item.barcode}`} />
            <Pressable onPress={() => changeQty(item.barcode, 1)} style={styles.stepBtn}><MaterialDesignIcons name="plus" size={22} color={colors.onSurface} /></Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Scan barcode barang yang keluar</Text>}
      />

      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalBox}><Text style={styles.totalLabel}>QTY</Text><Text style={styles.totalValue}>{totalQty}</Text></View>
          <Button title="CATAT KELUAR" onPress={submit} loading={submitting} icon="package-up" variant="danger" testID="submit-issue-button" style={{ flex: 1 }} />
        </View>
      )}

      <BranchPicker visible={pickBranch} branches={branches} currentId={branch?.id} onSelect={(b) => { setBranch(b); setPickBranch(false); }} onClose={() => setPickBranch(false)} />

      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Produk Baru</Text>
            <Text style={styles.modalSub}>Barcode: {pending}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Nama produk" placeholderTextColor={colors.muted} style={styles.modalInput} autoFocus testID="i-new-product-name" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title="Batal" variant="ghost" onPress={() => setPending(null)} style={{ flex: 1 }} />
              <Button title="Tambah" onPress={() => { if (pending) { addToCart(pending, newName.trim() || pending); setPending(null); } }} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  controls: { padding: spacing.lg, gap: spacing.md },
  rowBtns: { flexDirection: "row", gap: spacing.sm },
  selectBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 56 },
  selectText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: c.onSurface },
  chipsContent: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { height: 36, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowBarcode: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  stepBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qtyInput: { width: 50, textAlign: "center", color: c.onSurface, fontFamily: fonts.display, fontSize: 22, paddingVertical: 0 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: c.muted, textAlign: "center", paddingTop: spacing["2xl"], paddingHorizontal: spacing.xl },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  totalBox: { alignItems: "center" },
  totalLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  totalValue: { fontFamily: fonts.display, fontSize: 28, color: c.warning },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  modalSub: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  modalInput: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52, color: c.onSurface, fontFamily: fonts.body, fontSize: 16, borderWidth: 1.5, borderColor: c.border },
}));
