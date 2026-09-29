import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, ApiError, User } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

export default function AccountScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "admin";
  const [addOpen, setAddOpen] = useState(false);

  const ops = [
    { key: "transfer", label: "Transfer Cabang", icon: "swap-horizontal", route: "/transfer", tint: colors.brandPrimary },
    { key: "opname", label: "Stok Opname", icon: "clipboard-list-outline", route: "/opname", tint: colors.info },
    { key: "issue", label: "Barang Keluar", icon: "package-up", route: "/issue", tint: colors.warning },
    { key: "movements", label: "Laporan Stok", icon: "history", route: "/movements", tint: colors.success },
    ...(isAdmin
      ? [{ key: "branches", label: "Kelola Cabang", icon: "warehouse", route: "/branches", tint: colors.brandSecondary }]
      : []),
  ];

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<User[]>("/staff"),
    enabled: isAdmin,
  });

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>MENU</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialDesignIcons name="account" size={36} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{isAdmin ? "ADMIN" : "STAF GUDANG"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operasi Gudang</Text>
          <View style={styles.opsGrid}>
            {ops.map((op) => (
              <Pressable
                key={op.route}
                style={styles.opCard}
                onPress={() => router.push(op.route as never)}
                testID={`op-${op.key}`}
              >
                <View style={[styles.opIcon, { backgroundColor: op.tint }]}>
                  <MaterialDesignIcons name={op.icon as never} size={26} color={colors.onBrandPrimary} />
                </View>
                <Text style={styles.opLabel}>{op.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Kelola Staf</Text>
              <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)} testID="add-staff-button">
                <MaterialDesignIcons name="account-plus" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.addBtnText}>Tambah</Text>
              </Pressable>
            </View>

            {staffQuery.isLoading ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.md }} />
            ) : (staffQuery.data ?? []).length === 0 ? (
              <Text style={styles.emptyStaff}>Belum ada akun staf</Text>
            ) : (
              (staffQuery.data ?? []).map((s) => <StaffRow key={s.id} staff={s} />)
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Integrasi POS</Text>
          <View style={styles.posCard}>
            <MaterialDesignIcons name="cash-register" size={24} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.posTitle}>Terhubung dengan POS</Text>
              <Text style={styles.posSub}>Stok & harga otomatis tersinkron saat audit disetujui</Text>
            </View>
          </View>
        </View>

        <Button title="KELUAR" onPress={logout} variant="danger" icon="logout" testID="logout-button" style={styles.logout} />
      </ScrollView>

      {addOpen && <AddStaffModal onClose={() => setAddOpen(false)} />}
    </View>
  );
}

function StaffRow({ staff }: { staff: User }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await api.patch<User>(`/staff/${staff.id}/toggle`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.show(staff.active ? "Staf dinonaktifkan" : "Staf diaktifkan", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.staffRow} testID={`staff-${staff.id}`}>
      <View style={[styles.staffDot, { backgroundColor: staff.active ? colors.success : colors.muted }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.staffName}>{staff.name}</Text>
        <Text style={styles.staffEmail}>{staff.email}</Text>
      </View>
      <Pressable onPress={toggle} disabled={busy} style={styles.toggleBtn} testID={`toggle-staff-${staff.id}`}>
        {busy ? (
          <ActivityIndicator color={colors.onSurface} size="small" />
        ) : (
          <Text style={[styles.toggleText, { color: staff.active ? colors.error : colors.success }]}>
            {staff.active ? "Nonaktifkan" : "Aktifkan"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !email.trim() || password.length < 4) {
      toast.show("Lengkapi data (password min. 4 karakter)", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/staff", { name: name.trim(), email: email.trim(), password });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.show("Akun staf dibuat", "success");
      onClose();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal membuat akun", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Staf Baru</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nama lengkap" placeholderTextColor={colors.muted} style={styles.modalInput} testID="staff-name-input" />
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={styles.modalInput} testID="staff-email-input" />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry style={styles.modalInput} testID="staff-password-input" />
          <View style={styles.modalActions}>
            <Button title="Batal" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Simpan" onPress={save} loading={saving} style={{ flex: 1 }} testID="save-staff-button" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  avatar: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  profileName: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  profileEmail: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", backgroundColor: c.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: spacing.sm },
  roleText: { fontFamily: fonts.bodySemi, fontSize: 11, color: c.onBrandTertiary, letterSpacing: 0.5 },
  section: { gap: spacing.md },
  opsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  opCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  opIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  opLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurface },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  addBtnText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onBrandPrimary },
  emptyStaff: { fontFamily: fonts.body, fontSize: 14, color: c.muted, paddingVertical: spacing.md },
  staffRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  staffDot: { width: 10, height: 10, borderRadius: 5 },
  staffName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  staffEmail: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  toggleBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  toggleText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  posCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  posTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  posSub: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  logout: { marginTop: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  modalInput: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52, color: c.onSurface, fontFamily: fonts.body, fontSize: 16, borderWidth: 1.5, borderColor: c.border },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
}));
