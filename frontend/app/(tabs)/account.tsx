import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { POS_BASE, health, listStores } from "@/src/pos";
import { useAuth } from "@/src/auth";
import { journalCount, flushQueue } from "@/src/journal";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

export default function AccountScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [pendingJobs, setPendingJobs] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const storesQuery = useQuery({
    queryKey: ["pos-stores"],
    queryFn: () => listStores(),
    enabled: !!user,
  });
  const healthQuery = useQuery({
    queryKey: ["pos-health"],
    queryFn: () => health(),
    refetchInterval: 30000,
  });

  const storeName = (storesQuery.data ?? []).find((s) => s.id === user?.store_id)?.name;

  const refreshPending = async () => {
    if (user) setPendingJobs(await journalCount(user.id, user.store_id));
  };
  useEffect(() => {
    refreshPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const syncNow = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await flushQueue(user.id, user.store_id);
      await refreshPending();
      toast.show("Antrean tersinkron", "success");
    } catch {
      await refreshPending();
      toast.show("Sebagian antrean belum terkirim, coba lagi saat online", "error");
    } finally {
      setSyncing(false);
    }
  };

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  const online = healthQuery.data?.status === "ok";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>AKUN</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <MaterialDesignIcons name="account" size={30} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role === "admin" ? "ADMIN" : "GUDANG"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Koneksi POS</Text>
          <View style={styles.infoCard}>
            <MaterialDesignIcons name={online ? "lan-check" : "lan-disconnect"} size={22} color={online ? colors.success : colors.error} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.infoTitle} numberOfLines={1}>{POS_BASE}</Text>
              <Text style={styles.infoSub}>
                {online ? "Server POS online" : "Server POS tidak terjangkau"}
                {storeName ? ` • Cabang: ${storeName}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <MaterialDesignIcons
              name={pendingJobs > 0 ? "sync-alert" : "sync"}
              size={22}
              color={pendingJobs > 0 ? colors.warning : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Antrean offline: {pendingJobs} tugas</Text>
              <Text style={styles.infoSub}>Dikirim ulang otomatis saat online</Text>
            </View>
            {pendingJobs > 0 && (
              <Pressable onPress={syncNow} disabled={syncing} style={styles.syncBtn} testID="sync-now-button">
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.syncText}>Kirim</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        <Button title="KELUAR" onPress={logout} variant="danger" icon="logout" testID="logout-button" />
      </ScrollView>
    </View>
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
  sectionTitle: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.onSurface },
  infoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  infoTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: c.onSurface },
  infoSub: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  syncBtn: { backgroundColor: c.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  syncText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrandPrimary },
}));
