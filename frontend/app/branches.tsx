import React, { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, ApiError, Branch } from "@/src/api";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

export default function BranchesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
  });

  const toggle = async (b: Branch) => {
    setBusyId(b.id);
    try {
      await api.patch(`/branches/${b.id}`, { active: !b.active });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally { setBusyId(null); }
  };

  const renderItem = ({ item }: { item: Branch }) => (
    <View style={styles.row} testID={`branch-row-${item.id}`}>
      <View style={styles.icon}>
        <MaterialDesignIcons name={item.is_main ? "warehouse" : "store-outline"} size={22} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}{item.is_main ? "  (Pusat)" : ""}</Text>
        {item.code ? <Text style={styles.code}>{item.code}</Text> : null}
      </View>
      {item.is_main ? (
        <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>UTAMA</Text></View>
      ) : (
        <Pressable onPress={() => toggle(item)} disabled={busyId === item.id} style={styles.toggleBtn} testID={`toggle-branch-${item.id}`}>
          {busyId === item.id ? (
            <ActivityIndicator size="small" color={colors.onSurface} />
          ) : (
            <Text style={[styles.toggleText, { color: item.active ? colors.error : colors.success }]}>
              {item.active ? "Nonaktifkan" : "Aktifkan"}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="KELOLA CABANG"
        subtitle="Gudang & cabang toko"
        right={
          <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)} testID="add-branch-button">
            <MaterialDesignIcons name="plus" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        }
      />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        />
      )}
      {addOpen && <AddBranchModal onClose={() => setAddOpen(false)} />}
    </View>
  );
}

function AddBranchModal({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.show("Nama cabang wajib diisi", "error"); return; }
    setSaving(true);
    try {
      await api.post("/branches", { name: name.trim(), code: code.trim() });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.show("Cabang ditambahkan", "success");
      onClose();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Cabang Baru</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nama cabang" placeholderTextColor={colors.muted} style={styles.modalInput} autoFocus testID="branch-name-input" />
          <TextInput value={code} onChangeText={setCode} placeholder="Kode (opsional)" placeholderTextColor={colors.muted} autoCapitalize="characters" style={styles.modalInput} testID="branch-code-input" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button title="Batal" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Simpan" onPress={save} loading={saving} style={{ flex: 1 }} testID="save-branch-button" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  code: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  mainBadge: { backgroundColor: c.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  mainBadgeText: { fontFamily: fonts.bodySemi, fontSize: 11, color: c.onBrandTertiary },
  toggleBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  toggleText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  modalInput: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52, color: c.onSurface, fontFamily: fonts.body, fontSize: 16, borderWidth: 1.5, borderColor: c.border },
}));
