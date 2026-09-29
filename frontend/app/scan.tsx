import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, Platform } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { scanBus } from "@/src/scanBus";
import { Button } from "@/src/ui";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

export default function ScanScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [count, setCount] = useState(0);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const cooldown = useRef<Record<string, number>>({});

  const onScanned = (res: BarcodeScanningResult) => {
    const code = res.data;
    const now = Date.now();
    if (cooldown.current[code] && now - cooldown.current[code] < 1500) return;
    cooldown.current[code] = now;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scanBus.emit(code);
    setLastCode(code);
    setCount((c) => c + 1);
  };

  // Permission gate ----------------------------------------------------------
  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <MaterialDesignIcons name="camera-off" size={64} color={colors.muted} />
        <Text style={styles.permTitle}>Akses Kamera Diperlukan</Text>
        <Text style={styles.permSub}>Izinkan kamera untuk scan barcode produk saat menerima barang.</Text>
        <View style={styles.permActions}>
          {permission.canAskAgain ? (
            <Button title="Izinkan Kamera" onPress={requestPermission} icon="camera" testID="grant-camera-button" />
          ) : (
            <Button title="Buka Pengaturan" onPress={() => Linking.openSettings()} icon="cog" testID="open-settings-button" />
          )}
          <Button title="Kembali" variant="ghost" onPress={() => router.back()} testID="scan-back-button" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        onBarcodeScanned={onScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr", "itf14"],
        }}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()} testID="scan-close-button">
            <MaterialDesignIcons name="close" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={styles.counter}>
            <Text style={styles.counterLabel}>SCAN</Text>
            <Text style={styles.counterValue} testID="scan-count">{count}</Text>
          </View>
        </View>

        <View style={styles.frame} />

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
          {lastCode ? (
            <View style={styles.lastPill}>
              <MaterialDesignIcons name="check-circle" size={20} color={colors.success} />
              <Text style={styles.lastText} numberOfLines={1}>{lastCode}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Arahkan kamera ke barcode</Text>
          )}
          <Button title="SELESAI" onPress={() => router.back()} icon="check" testID="scan-done-button" />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  permTitle: { fontFamily: fonts.displaySemi, fontSize: 24, color: c.onSurface, textAlign: "center" },
  permSub: { fontFamily: fonts.body, fontSize: 15, color: c.muted, textAlign: "center" },
  permActions: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.lg },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  counterLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  counterValue: { fontFamily: fonts.display, fontSize: 26, color: c.brandPrimary },
  frame: {
    alignSelf: "center",
    width: "72%",
    aspectRatio: 1.4,
    borderWidth: 3,
    borderColor: c.brandPrimary,
    borderRadius: radius.lg,
  },
  bottomBar: { paddingHorizontal: spacing.lg, gap: spacing.md },
  lastPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lastText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: c.onSurface },
  hint: { fontFamily: fonts.body, fontSize: 14, color: c.onSurface, textAlign: "center", opacity: 0.8 },
}));
