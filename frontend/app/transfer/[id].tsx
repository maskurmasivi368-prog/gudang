import React, { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { PosError, TransferDoc, TransferItem, getTransfer } from "@/src/pos";
import { mutate } from "@/src/journal";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

const rupiah = (n?: number) => (n == null ? "-" : "Rp " + Math.round(n).toLocaleString("id-ID"));

export default function TransferDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkQty, setCheckQty] = useState<Record<string, string>>({});
  const [checkNote, setCheckNote] = useState("");

  const { data: doc, isLoading, refetch } = useQuery({
    queryKey: ["pos-transfer", id],
    queryFn: () => getTransfer(id!),
    enabled: !!user && !!id,
  });

  const isOutgoing = doc?.from_store === user?.store_id;
  const items: TransferItem[] = doc?.items ?? [];

  const applyDoc = (d: TransferDoc) => {
    queryClient.setQueryData(["pos-transfer", id], d);
    queryClient.invalidateQueries({ queryKey: ["pos-transfers"] });
  };

  const act = async (action: "dispatch" | "cancel" | "post", extra: Record<string, unknown> = {}) => {
    if (!user || !doc) return;
    setBusy(action);
    try {
      const res = await mutate<TransferDoc>(user.id, user.store_id, `branch-transfers/${doc.id}/${action}`, "POST", {
        revision: doc.revision,
        confirmed: true,
        ...extra,
      });
      applyDoc(res);
      toast.show(
        action === "dispatch" ? "Dikirim — stok pengirim berkurang"
        : action === "cancel" ? "Transfer dibatalkan, reservasi dilepas"
        : "Penerimaan diposting — stok bertambah",
        "success",
      );
    } catch (e) {
      const err = e as PosError;
      if (err.status === 409) {
        toast.show("Konflik revisi — data dimuat ulang", "error");
        refetch();
      } else if (err.network) {
        toast.show("Offline: aksi masuk antrean, dikirim otomatis saat online", "info");
      } else {
        toast.show(err.message, "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const startCheck = () => {
    const init: Record<string, string> = {};
    items.forEach((i) => {
      init[i.product_id] = String((i.sent_qty ?? i.qty) - (i.received_qty ?? 0));
    });
    setCheckQty(init);
    setCheckNote("");
    setChecking(true);
  };

  const submitCheck = async () => {
    if (!user || !doc) return;
    const payload = items.map((i) => ({
      product_id: i.product_id,
      qty: Math.max(0, parseInt(checkQty[i.product_id] || "0", 10) || 0),
      checked: true,
    }));
    if (payload.every((p) => p.qty === 0)) {
      toast.show("Minimal satu barang harus diterima positif", "error");
      return;
    }
    const hasDiff = payload.some((p, ix) => p.qty < (items[ix].sent_qty ?? items[ix].qty) - (items[ix].received_qty ?? 0));
    if (hasDiff && checkNote.trim().length < 3) {
      toast.show("Ada selisih — isi catatan pemeriksaan", "error");
      return;
    }
    setBusy("check");
    try {
      const res = await mutate<TransferDoc>(user.id, user.store_id, `branch-transfers/${doc.id}/check`, "POST", {
        revision: doc.revision,
        confirmed: true,
        note: checkNote.trim(),
        items: payload,
      });
      applyDoc(res);
      setChecking(false);
      toast.show("Hasil cek tersimpan (belum menambah stok)", "success");
    } catch (e) {
      const err = e as PosError;
      if (err.status === 409) {
        toast.show("Konflik revisi — data dimuat ulang", "error");
        refetch();
      } else if (err.network) {
        toast.show("Offline: hasil cek masuk antrean", "info");
        setChecking(false);
      } else {
        toast.show(err.message, "error");
      }
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !doc) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const canDispatch = isOutgoing && doc.state === "draft";
  const canCancel = isOutgoing && doc.state === "draft";
  const canCheck = !isOutgoing && (doc.state === "shipped" || doc.state === "partial_received");
  const canPost = !isOutgoing && doc.state === "receipt_draft";

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={doc.request_no}
        subtitle={`${doc.from_store_name} → ${doc.to_store_name} • ${doc.state.toUpperCase()} • rev ${doc.revision}`}
      />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        {items.map((item) => {
          const remaining = (item.sent_qty ?? item.qty) - (item.received_qty ?? 0);
          return (
            <View key={item.product_id} style={styles.itemRow} testID={`doc-item-${item.product_id}`}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name ?? item.product_id}</Text>
                <Text style={styles.itemMeta}>
                  {item.qty} {item.unit}
                  {item.unit_cost != null ? ` • modal ${rupiah(item.unit_cost)}` : ""}
                </Text>
                {doc.state !== "draft" && (
                  <Text style={styles.itemMeta}>
                    Terkirim {item.sent_qty ?? item.qty} • Diterima {item.received_qty ?? 0} • Sisa {Math.max(0, remaining)}
                  </Text>
                )}
              </View>
              {checking && canCheck && (
                <View style={styles.checkBox}>
                  <Text style={styles.checkLabel}>TERIMA</Text>
                  <TextInput
                    value={checkQty[item.product_id]}
                    onChangeText={(v) =>
                      setCheckQty((p) => ({ ...p, [item.product_id]: v.replace(/[^0-9]/g, "") }))
                    }
                    keyboardType="number-pad"
                    style={styles.checkInput}
                    testID={`check-${item.product_id}`}
                  />
                </View>
              )}
            </View>
          );
        })}

        {doc.totals && doc.state !== "draft" && (
          <View style={styles.totalsCard}>
            <Text style={styles.totalsTitle}>Nilai Modal (dari server)</Text>
            <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Dikirim</Text><Text style={styles.totalsValue}>{rupiah(doc.totals.sent_value)}</Text></View>
            <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Diterima</Text><Text style={styles.totalsValue}>{rupiah(doc.totals.received_value)}</Text></View>
            <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Selisih</Text><Text style={[styles.totalsValue, { color: colors.warning }]}>{rupiah(doc.totals.difference_value)}</Text></View>
          </View>
        )}

        {checking && canCheck && (
          <View style={styles.checkForm}>
            <Text style={styles.checkFormTitle}>Catatan pemeriksaan{checkNote ? "" : " (wajib bila ada selisih)"}</Text>
            <TextInput
              value={checkNote}
              onChangeText={setCheckNote}
              placeholder="cth: 1 BAL belum tiba"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
              testID="check-note-input"
            />
            <View style={styles.checkActions}>
              <Button title="Batal" variant="ghost" onPress={() => setChecking(false)} style={{ flex: 1 }} />
              <Button title="SIMPAN HASIL CEK" onPress={submitCheck} loading={busy === "check"} icon="clipboard-check" testID="submit-check-button" style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>

      {!checking && (canDispatch || canCancel || canCheck || canPost) && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {canCancel && (
            <Button title="BATALKAN" variant="ghost" onPress={() => act("cancel")} loading={busy === "cancel"} style={{ flex: 0.6 }} testID="cancel-transfer-button" />
          )}
          {canDispatch && (
            <Button title="KIRIM (DISPATCH)" onPress={() => act("dispatch", { note: "" })} loading={busy === "dispatch"} icon="truck-fast" testID="dispatch-button" style={{ flex: 1 }} />
          )}
          {canCheck && (
            <Button title="PERIKSA BARANG" onPress={startCheck} icon="clipboard-check-outline" testID="start-check-button" style={{ flex: 1 }} />
          )}
          {canPost && (
            <Button title="POSTING PENERIMAAN" onPress={() => act("post", { note: "" })} loading={busy === "post"} icon="check-decagram" testID="post-button" style={{ flex: 1 }} />
          )}
        </View>
      )}

      {!isOutgoing && !canCheck && !canPost && doc.state === "draft" && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.waitText}>Menunggu pengirim melakukan dispatch</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  itemName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  itemMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  checkBox: { alignItems: "center" },
  checkLabel: { fontFamily: fonts.body, fontSize: 9, color: c.muted },
  checkInput: { width: 56, textAlign: "center", color: c.brandPrimary, fontFamily: fonts.display, fontSize: 20, paddingVertical: 0, borderBottomWidth: 1.5, borderBottomColor: c.borderStrong },
  totalsCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.xs, marginTop: spacing.sm },
  totalsTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurface, marginBottom: spacing.xs },
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  totalsLabel: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  totalsValue: { fontFamily: fonts.displaySemi, fontSize: 16, color: c.onSurface },
  checkForm: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1.5, borderColor: c.brandPrimary, gap: spacing.md, marginTop: spacing.sm },
  checkFormTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurface },
  noteInput: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, color: c.onSurface, fontFamily: fonts.body, fontSize: 14, borderWidth: 1.5, borderColor: c.border },
  checkActions: { flexDirection: "row", gap: spacing.md },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  waitText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center" },
}));
