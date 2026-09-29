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

interface OpItem { barcode: string; name: string; physical: number; system: number }

export default function OpnameNewScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { branches, current } = useBranch();

  const [branch, setBranch] = useState(current);
  const [items, setItems] = useState<OpItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickBranch, setPickBranch] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const branchRef = useRef(branch);
  branchRef.current = branch;

  const bumpPhysical = useCallback((code: string, name: string, system: number) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.barcode === code);
      if (idx >= 0) { const c = [...prev]; c[idx] = { ...c[idx], physical: c[idx].physical + 1 }; return c; }
      return [{ barcode: code, name, physical: 1, system }, ...prev];
    });
  }, []);

  const handleCode = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const existing = itemsRef.current.find((i) => i.barcode === code);
    if (existing) { bumpPhysical(code, existing.name, existing.system); toast.show(`${existing.name}: ${existing.physical + 1}`, "success"); return; }
    try {
      const bid = branchRef.current?.id;
      const p = await api.get<Product>(`/products/barcode/${code}${bid ? `?branch_id=${bid}` : ""}`);
      bumpPhysical(code, p.name, p.branch_stock ?? 0);
      toast.show(`${p.name} dihitung`, "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setPending(code); setNewName(""); }
      else toast.show("Gagal memuat produk", "error");
    }
  }, [bumpPhysical, toast]);

  useEffect(() => scanBus.subscribe((c) => handleCode(c)), [handleCode]);

  const onSubmitBarcode = () => { if (!barcode.trim()) return; handleCode(barcode); setBarcode(""); };
  const setPhysical = (code: string, v: string) => {
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    setItems((prev) => prev.map((i) => (i.barcode === code ? { ...i, physical: isNaN(n) ? 0 : n } : i)));
  };
  const remove = (code: string) => setItems((prev) => prev.filter((i) => i.barcode !== code));

  const submit = async () => {
    if (!branch) { toast.show("Pilih cabang", "error"); return; }
    if (items.length === 0) { toast.show("Belum ada item dihitung", "error"); return; }
    setSubmitting(true);
    try {
      await api.post("/opnames", {
        branch_id: branch.id,
        items: items.map((i) => ({ barcode: i.barcode, name: i.name, physical_qty: i.physical })),
      });
      queryClient.invalidateQueries({ queryKey: ["opnames"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.show("Opname selesai, stok disesuaikan", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/opname");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally { setSubmitting(false); }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="STOK OPNAME" subtitle="Hitung fisik & sesuaikan" />
      <View style={styles.controls}>
        <Pressable style={styles.selectBtn} onPress={() => setPickBranch(true)} testID="opname-branch">
          <MaterialDesignIcons name="warehouse" size={18} color={colors.brandPrimary} />
          <Text style={styles.selectText} numberOfLines={1}>{branch?.name ?? "Cabang"}</Text>
          <MaterialDesignIcons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <ScanInput value={barcode} onChangeText={setBarcode} onSubmit={onSubmitBarcode} onCamera={() => router.push("/scan")} placeholder="Scan / ketik untuk hitung" />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.barcode}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const diff = item.physical - item.system;
          const diffColor = diff === 0 ? colors.muted : diff > 0 ? colors.success : colors.error;
          return (
            <View style={styles.itemRow} testID={`opname-item-${item.barcode}`}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta}>Sistem {item.system} • Selisih <Text style={{ color: diffColor }}>{diff > 0 ? "+" : ""}{diff}</Text></Text>
              </View>
              <View style={styles.physBox}>
                <Text style={styles.physLabel}>FISIK</Text>
                <TextInput value={String(item.physical)} onChangeText={(v) => setPhysical(item.barcode, v)} keyboardType="number-pad" style={styles.physInput} testID={`o-phys-${item.barcode}`} />
              </View>
              <Pressable onPress={() => remove(item.barcode)} style={styles.removeBtn} testID={`o-remove-${item.barcode}`}>
                <MaterialDesignIcons name="trash-can-outline" size={22} color={colors.error} />
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Scan produk untuk mulai menghitung stok fisik</Text>}
      />

      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalBox}><Text style={styles.totalLabel}>ITEM</Text><Text style={styles.totalValue}>{items.length}</Text></View>
          <Button title="SIMPAN & SESUAIKAN" onPress={submit} loading={submitting} icon="check-decagram" testID="submit-opname-button" style={{ flex: 1 }} />
        </View>
      )}

      <BranchPicker visible={pickBranch} branches={branches} currentId={branch?.id} onSelect={(b) => { setBranch(b); setItems([]); setPickBranch(false); }} onClose={() => setPickBranch(false)} />

      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Produk Baru</Text>
            <Text style={styles.modalSub}>Barcode: {pending}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Nama produk" placeholderTextColor={colors.muted} style={styles.modalInput} autoFocus testID="o-new-product-name" />
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Button title="Batal" variant="ghost" onPress={() => setPending(null)} style={{ flex: 1 }} />
              <Button title="Tambah" onPress={() => { if (pending) { bumpPhysical(pending, newName.trim() || pending, 0); setPending(null); } }} style={{ flex: 1 }} />
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
  selectBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48 },
  selectText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: c.onSurface },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  physBox: { alignItems: "center" },
  physLabel: { fontFamily: fonts.body, fontSize: 9, color: c.muted },
  physInput: { width: 56, textAlign: "center", color: c.brandPrimary, fontFamily: fonts.display, fontSize: 20, paddingVertical: 0, borderBottomWidth: 1.5, borderBottomColor: c.borderStrong },
  removeBtn: { padding: spacing.xs },
  empty: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center", paddingTop: spacing["2xl"], paddingHorizontal: spacing.xl },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  totalBox: { alignItems: "center" },
  totalLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  totalValue: { fontFamily: fonts.display, fontSize: 26, color: c.brandPrimary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  modalSub: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  modalInput: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, color: c.onSurface, fontFamily: fonts.body, fontSize: 15, borderWidth: 1.5, borderColor: c.border },
}));
