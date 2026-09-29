import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { PosError, PosSupplier, listSuppliers, uuid, Batch } from "@/src/pos";
import { mutate } from "@/src/journal";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

export default function BatchNewScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [supplier, setSupplier] = useState<PosSupplier | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState(false);
  const [creating, setCreating] = useState(false);

  const suppliersQuery = useQuery({
    queryKey: ["pos-suppliers"],
    queryFn: () => listSuppliers(),
    enabled: !!user,
  });

  const create = async () => {
    if (!user) return;
    if (!supplier) {
      toast.show("Pilih supplier dulu", "error");
      return;
    }
    setCreating(true);
    try {
      // request_id UUID stays stable across retries of this exact action.
      const batch = await mutate<Batch>(user.id, user.store_id, "warehouse/batches", "POST", {
        request_id: uuid(),
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        reference: reference.trim(),
        note: note.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["pos-batches"] });
      toast.show("Draf penerimaan dibuat", "success");
      router.replace(`/batch/${batch.id}`);
    } catch (e) {
      const err = e as PosError;
      toast.show(
        err.network
          ? "Offline: gagal membuat draf. Coba saat koneksi kembali."
          : err.message,
        "error",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="PENERIMAAN BARU" subtitle="Pilih supplier, lalu scan barang" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[styles.form, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.label}>Supplier</Text>
          <Pressable style={styles.select} onPress={() => setSheet(true)} testID="supplier-select-button">
            <MaterialDesignIcons name="truck-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.selectText} numberOfLines={1}>
              {supplier ? supplier.name : "Pilih Supplier"}
            </Text>
            <MaterialDesignIcons name="chevron-down" size={20} color={colors.muted} />
          </Pressable>

          <Text style={styles.label}>No. Surat Jalan / Referensi (opsional)</Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="SJ-2026-001"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="characters"
            testID="reference-input"
          />

          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Catatan penerimaan"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="note-input"
          />

          <Button
            title="BUAT DRAF & MULAI SCAN"
            onPress={create}
            loading={creating}
            icon="barcode-scan"
            testID="create-batch-button"
            style={{ marginTop: spacing.md }}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Pilih Supplier</Text>
          {suppliersQuery.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
          ) : (
            <FlatList
              data={suppliersQuery.data ?? []}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setSupplier(item);
                    setSheet(false);
                  }}
                  testID={`supplier-${item.id}`}
                >
                  <MaterialDesignIcons name="truck-outline" size={20} color={colors.brandPrimary} />
                  <Text style={styles.sheetRowText}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Belum ada supplier di POS</Text>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  form: { flex: 1, padding: spacing.lg, gap: spacing.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary, marginTop: spacing.md },
  select: {
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
  selectText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: c.onSurface },
  input: {
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    color: c.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface, marginBottom: spacing.sm },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  sheetRowText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: c.muted, paddingVertical: spacing.lg },
}));
