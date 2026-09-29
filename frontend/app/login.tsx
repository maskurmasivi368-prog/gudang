import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { ApiError } from "@/src/api";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const BG =
  "https://images.unsplash.com/photo-1644079446600-219068676743?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwyfHxlbXB0eSUyMHdhcmVob3VzZSUyMHNoZWxmJTIwZGFya3xlbnwwfHx8fDE3OTA2MTc2Mzl8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.show("Isi email dan password", "error");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Gagal masuk";
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={BG} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(18,18,18,0.75)", "rgba(18,18,18,0.97)"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={[styles.content, { paddingTop: insets.top + spacing["3xl"], paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <MaterialDesignIcons name="barcode-scan" size={34} color={colors.onBrandPrimary} />
            </View>
            <View>
              <Text style={styles.brandTitle}>GUDANG PDA</Text>
              <Text style={styles.brandSub}>Sistem Penerimaan Barang</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <MaterialDesignIcons name="email-outline" size={22} color={colors.muted} />
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="nama@gudang.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <MaterialDesignIcons name="lock-outline" size={22} color={colors.muted} />
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPass}
                style={styles.input}
              />
              <Pressable onPress={() => setShowPass((s) => !s)} testID="toggle-password">
                <MaterialDesignIcons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <Button
              title="MASUK"
              onPress={onSubmit}
              loading={loading}
              icon="login"
              testID="login-submit-button"
              style={styles.cta}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, letterSpacing: 1 },
  brandSub: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  form: { gap: spacing.sm },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary, marginTop: spacing.md },
  inputWrap: {
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
  input: { flex: 1, color: c.onSurface, fontFamily: fonts.body, fontSize: 16 },
  cta: { marginTop: spacing.xl },
}));
