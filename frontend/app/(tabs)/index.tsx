import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { api, ApiError, Supplier, Product } from "@/src/api";
import { useToast } from "@/src/toast";
import { useBranch } from "@/src/branch";
import { Button } from "@/src/ui";
import { ScanInput } from "@/src/components/scan-input";
import { BranchPicker } from "@/src/components/branch-picker";
import { scanBus } from "@/src/scanBus";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

interface CartItem { barcode: string; name: string; qty: number }

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1758543102397-e14b5dfdd8bd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwxfHxiYXJjb2RlJTIwc2Nhbm5lciUyMHdhcmVob3VzZXxlbnwwfHx8fDE3OTA2MTc2MzV8MA&ixlib=rb-4.1.0&q=85";

export default function ReceiveScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branches, current, setCurrentId } = useBranch();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [supplierSheet, setSupplierSheet] = useState(false);
  const [branchPicker, setBranchPicker] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<Supplier[]>("/suppliers"),
  });

  const addToCart = useCallback((code: string, name: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.barcode === code);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [{ barcode: code, name, qty: 1 }, ...prev];
    });
  }, []);

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const existing = itemsRef.current.find((i) => i.barcode === code);
      if (existing) {
        addToCart(code, existing.name);
        toast.show(`${existing.name} +1 (${existing.qty + 1})`, "success");
        return;
      }
      try {
        const product = await api.get<Product>(`/products/barcode/${code}`);
        addToCart(code, product.name);
        toast.show(`${product.name} ditambahkan`, "success");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setPendingBarcode(code);
          setNewName("");
        } else {
          toast.show("Gagal memuat produk", "error");
        }
      }
    },
    [addToCart, toast],
  );

  // Subscribe to camera scanner emissions
  useEffect(() => {
    const unsub = scanBus.subscribe((code) => handleCode(code));
    return unsub;
  }, [handleCode]);

  const onManualSubmit = () => {
    if (!barcode.trim()) return;
    handleCode(barcode);
    setBarcode("");
  };

  const confirmNewProduct = () => {
    if (!pendingBarcode) return;
    const name = newName.trim() || pendingBarcode;
    addToCart(pendingBarcode, name);
    toast.show(`${name} ditambahkan`, "success");
    setPendingBarcode(null);
    setNewName("");
  };

  const changeQty = (code: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.barcode === code ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0),
    );
  };

  const setQty = (code: string, value: string) => {
    const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
    setItems((prev) => prev.map((i) => (i.barcode === code ? { ...i, qty: isNaN(n) ? 0 : n } : i)));
  };

  const removeItem = (code: string) => {
    setItems((prev) => prev.filter((i) => i.barcode !== code));
  };

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const submit = async () => {
    if (!supplier) {
      toast.show("Pilih supplier dulu", "error");
      return;
    }
    const clean = items.filter((i) => i.qty > 0);
    if (clean.length === 0) {
      toast.show("Belum ada item di-scan", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/receipts", {
        supplier_id: supplier.id,
        branch_id: current?.id,
        items: clean.map((i) => ({ barcode: i.barcode, name: i.name, qty: i.qty })),
      });
      toast.show("Terkirim ke audit admin", "success");
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal mengirim", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.row} testID={`cart-row-${item.barcode}`}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowBarcode}>{item.barcode}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => changeQty(item.barcode, -1)}
          style={styles.stepBtn}
          testID={`minus-${item.barcode}`}
        >
          <MaterialDesignIcons name="minus" size={22} color={colors.onSurface} />
        </Pressable>
        <TextInput
          value={String(item.qty)}
          onChangeText={(v) => setQty(item.barcode, v)}
          keyboardType="number-pad"
          style={styles.qtyInput}
          testID={`qty-${item.barcode}`}
        />
        <Pressable
          onPress={() => changeQty(item.barcode, 1)}
          style={styles.stepBtn}
          testID={`plus-${item.barcode}`}
        >
          <MaterialDesignIcons name="plus" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <Pressable onPress={() => removeItem(item.barcode)} style={styles.removeBtn} testID={`remove-${item.barcode}`}>
        <MaterialDesignIcons name="trash-can-outline" size={22} color={colors.error} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>TERIMA BARANG</Text>
            <Text style={styles.subtitle}>Scan atau input barcode</Text>
          </View>
          <Pressable style={styles.branchChip} onPress={() => setBranchPicker(true)} testID="branch-chip">
            <MaterialDesignIcons name="warehouse" size={16} color={colors.brandPrimary} />
            <Text style={styles.branchChipText} numberOfLines={1}>{current?.name ?? "Cabang"}</Text>
            <MaterialDesignIcons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* Supplier + barcode controls */}
      <View style={styles.controls}>
        <Pressable
          style={styles.supplierBtn}
          onPress={() => setSupplierSheet(true)}
          testID="supplier-select-button"
        >
          <MaterialDesignIcons name="truck-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.supplierText} numberOfLines={1}>
            {supplier ? supplier.name : "Pilih Supplier"}
          </Text>
          <MaterialDesignIcons name="chevron-down" size={22} color={colors.muted} />
        </Pressable>

        <ScanInput
          value={barcode}
          onChangeText={setBarcode}
          onSubmit={onManualSubmit}
          onCamera={() => router.push("/scan")}
        />
      </View>

      {/* Cart */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.barcode}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image source={EMPTY_IMG} style={styles.emptyImg} contentFit="cover" />
            <Text style={styles.emptyTitle}>Belum ada item</Text>
            <Text style={styles.emptySub}>Mulai scan barcode untuk menambah barang</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />

      {/* Sticky submit */}
      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL QTY</Text>
            <Text style={styles.totalValue} testID="total-qty">{totalQty}</Text>
          </View>
          <Button
            title="KIRIM KE PEMBELIAN"
            onPress={submit}
            loading={submitting}
            icon="send"
            testID="submit-receipt-button"
            style={styles.submitBtn}
          />
        </View>
      )}

      {/* Supplier sheet */}
      <SupplierSheet
        visible={supplierSheet}
        suppliers={suppliersQuery.data ?? []}
        loading={suppliersQuery.isLoading}
        onClose={() => setSupplierSheet(false)}
        onSelect={(s) => {
          setSupplier(s);
          setSupplierSheet(false);
        }}
        onAdded={(s) => {
          queryClient.invalidateQueries({ queryKey: ["suppliers"] });
          setSupplier(s);
          setSupplierSheet(false);
        }}
      />

      {/* New product modal */}
      <Modal visible={pendingBarcode !== null} transparent animationType="fade" onRequestClose={() => setPendingBarcode(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Produk Baru</Text>
            <Text style={styles.modalSub}>Barcode: {pendingBarcode}</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Nama produk"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              autoFocus
              testID="new-product-name-input"
            />
            <View style={styles.modalActions}>
              <Button title="Batal" variant="ghost" onPress={() => setPendingBarcode(null)} style={styles.modalBtn} />
              <Button title="Tambah" onPress={confirmNewProduct} testID="confirm-new-product" style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <BranchPicker
        visible={branchPicker}
        branches={branches}
        currentId={current?.id}
        title="Terima ke Cabang"
        onSelect={(b) => {
          setCurrentId(b.id);
          setBranchPicker(false);
        }}
        onClose={() => setBranchPicker(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
function SupplierSheet({
  visible,
  suppliers,
  loading,
  onClose,
  onSelect,
  onAdded,
}: {
  visible: boolean;
  suppliers: Supplier[];
  loading: boolean;
  onClose: () => void;
  onSelect: (s: Supplier) => void;
  onAdded: (s: Supplier) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.show("Nama supplier wajib diisi", "error");
      return;
    }
    setSaving(true);
    try {
      const s = await api.post<Supplier>("/suppliers", { name: name.trim(), phone: phone.trim() });
      setName("");
      setPhone("");
      setAdding(false);
      onAdded(s);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{adding ? "Supplier Baru" : "Pilih Supplier"}</Text>
          {!adding && (
            <Pressable onPress={() => setAdding(true)} style={styles.addSupplierBtn} testID="add-supplier-button">
              <MaterialDesignIcons name="plus" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.addSupplierText}>Tambah</Text>
            </Pressable>
          )}
        </View>

        {adding ? (
          <View style={styles.addForm}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nama supplier"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              autoFocus
              testID="supplier-name-input"
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="No. telepon (opsional)"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.modalInput}
              testID="supplier-phone-input"
            />
            <View style={styles.modalActions}>
              <Button title="Batal" variant="ghost" onPress={() => setAdding(false)} style={styles.modalBtn} />
              <Button title="Simpan" onPress={save} loading={saving} testID="save-supplier-button" style={styles.modalBtn} />
            </View>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={suppliers}
            keyExtractor={(s) => s.id}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <Pressable style={styles.supplierRow} onPress={() => onSelect(item)} testID={`supplier-${item.id}`}>
                <MaterialDesignIcons name="truck-outline" size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplierRowName}>{item.name}</Text>
                  {item.phone ? <Text style={styles.supplierRowPhone}>{item.phone}</Text> : null}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptySub}>Belum ada supplier</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 150,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  branchChipText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurface },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  controls: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.md },
  supplierBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  supplierText: { flex: 1, color: c.onSurface, fontFamily: fonts.bodyMedium, fontSize: 15 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  rowBarcode: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    width: 46,
    textAlign: "center",
    color: c.onSurface,
    fontFamily: fonts.display,
    fontSize: 20,
    paddingVertical: 0,
  },
  removeBtn: { padding: spacing.xs },
  empty: { alignItems: "center", paddingTop: spacing["2xl"], gap: spacing.md },
  emptyImg: { width: 130, height: 130, borderRadius: radius.lg, opacity: 0.7 },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center", paddingHorizontal: spacing.xl },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  totalBox: { alignItems: "center" },
  totalLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  totalValue: { fontFamily: fonts.display, fontSize: 26, color: c.brandPrimary },
  submitBtn: { flex: 1 },
  // modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  modalSub: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  modalInput: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    color: c.onSurface,
    fontFamily: fonts.body,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  modalActions: { flexDirection: "row", gap: spacing.md },
  modalBtn: { flex: 1 },
  // supplier sheet
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  addSupplierBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: c.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addSupplierText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onBrandPrimary },
  addForm: { gap: spacing.md },
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  supplierRowName: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  supplierRowPhone: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
}));
