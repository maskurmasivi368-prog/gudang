import { View, ActivityIndicator, StyleSheet } from "react-native";

// Entry screen: AuthGate (in _layout) routes to /login or /(tabs) based on
// the POS session; this only shows a splash while the session is restored.
export default function Index() {
  return (
    <View style={styles.container} testID="splash-loading">
      <ActivityIndicator size="large" color="#FF6B00" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", alignItems: "center", justifyContent: "center" },
});
