import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { api, ApiError, Receipt } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/toast";
import { Button } from "@/src/ui";
import { makeStyles, useTheme, spacing, radius, fonts } from "@/src/theme";

type Filter = "pending_audit" | "approved";

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export default function AuditScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [filter, setFilter] = useState<Filter>("pending_audit");
  const [selected, setSelected] = useState<Receipt | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["receipts", filter],
    queryFn: () => api.get<Receipt[]>(`/receipts?status=${filter}`),
  });

  const chips: { key: Filter; label: string }[] = [
    { key: "pending_audit", label: "Menunggu Audit" },
    { key: "approved", label: "Selesai" },
  ];

  const renderCard = ({ item }: { item: Receipt }) => {
    const approved = item.status === "approved";
    return (
      <Pressable style={styles.card} onPress={() => setSelected(item)} testID={`receipt-${item.id}`}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardSupplier} numberOfLines={1}>{item.supplier_name}</Text>
            <Text style={styles.cardMeta}>{item.branch_name ? `${item.branch_name} • ` : ""}oleh {item.created_by_name}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: approved ? colors.brandTertiary : colors.surfaceTertiary }]}>
            <MaterialDesignIcons
              name={approved ? "check-circle" : "clock-outline"}
              size={14}
              color={approved ? colors.success : colors.warning}
            />
            <Text style={[styles.badgeText, { color: approved ? colors.success : colors.warning }]}>
              {approved ? "Selesai" : "Menunggu"}
            </Text>
          </View>
        </View>
        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.items.length}</Text>
            <Text style={styles.statLabel}>Item</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.total_qty}</Text>
            <Text style={styles.statLabel}>Qty</Text>
          </View>
          {approved && (
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.brandPrimary }]}>{rupiah(item.total_cost)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          )}
          <MaterialDesignIcons name="chevron-right" size={24} color={colors.muted} style={{ marginLeft: "auto" }} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>AUDIT ADMIN</Text>
        <Text style={styles.subtitle}>{isAdmin ? "Verifikasi harga sebelum ke pembelian" : "Status penerimaan Anda"}</Text>
      </View>

      <View style={styles.chipRow}>
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={[styles.chip, active && styles.chipActive]}
              testID={`filter-${c.key}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialDesignIcons name="clipboard-check-outline" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Tidak ada data</Text>
              <Text style={styles.emptySub}>
                {filter === "pending_audit" ? "Belum ada penerimaan menunggu audit" : "Belum ada penerimaan selesai"}
              </Text>
            </View>
          }
        />
      )}

      {selected && (
        <ReceiptDetail
          receipt={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
function ReceiptDetail({
  receipt,
  isAdmin,
  onClose,
}: {
  receipt: Receipt;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editable = isAdmin && receipt.status === "pending_audit";

  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    receipt.items.forEach((i) => {
      init[i.barcode] = String(i.unit_cost || i.last_cost || 0);
    });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () =>
      receipt.items.reduce((s, i) => {
        const c = parseFloat(costs[i.barcode] || "0") || 0;
        return s + c * i.qty;
      }, 0),
    [costs, receipt.items],
  );

  const approve = async () => {
    setSaving(true);
    try {
      await api.post(`/receipts/${receipt.id}/approve`, {
        items: receipt.items.map((i) => ({
          barcode: i.barcode,
          unit_cost: parseFloat(costs[i.barcode] || "0") || 0,
        })),
      });
      toast.show("Disetujui & disinkron ke POS", "success");
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Gagal menyetujui", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailRoot}>
        <View style={[styles.detailHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={onClose} style={styles.detailClose} testID="detail-close-button">
            <MaterialDesignIcons name="close" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle} numberOfLines={1}>{receipt.supplier_name}</Text>
            <Text style={styles.detailMeta}>{receipt.items.length} item • {receipt.total_qty} qty</Text>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.detailBody} keyboardShouldPersistTaps="handled">
            {editable && (
              <View style={styles.infoBanner}>
                <MaterialDesignIcons name="information" size={18} color={colors.info} />
                <Text style={styles.infoText}>Harga otomatis ditarik dari pembelian sebelumnya. Sesuaikan bila perlu.</Text>
              </View>
            )}
            {receipt.items.map((item) => {
              const lineTotal = (parseFloat(costs[item.barcode] || "0") || 0) * item.qty;
              return (
                <View key={item.barcode} style={styles.detailRow} testID={`detail-item-${item.barcode}`}>
                  <View style={styles.detailRowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.detailBarcode}>{item.barcode}</Text>
                    </View>
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>x{item.qty}</Text>
                    </View>
                  </View>

                  <View style={styles.priceRow}>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>Harga Terakhir</Text>
                      <Text style={styles.lastPrice}>{rupiah(item.last_cost)}</Text>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>Harga Satuan</Text>
                      {editable ? (
                        <View style={styles.costInputWrap}>
                          <Text style={styles.rp}>Rp</Text>
                          <TextInput
                            value={costs[item.barcode]}
                            onChangeText={(v) => setCosts((p) => ({ ...p, [item.barcode]: v.replace(/[^0-9]/g, "") }))}
                            keyboardType="number-pad"
                            style={styles.costInput}
                            testID={`cost-${item.barcode}`}
                          />
                        </View>
                      ) : (
                        <Text style={styles.finalPrice}>{rupiah(parseFloat(costs[item.barcode] || "0") || 0)}</Text>
                      )}
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>Subtotal</Text>
                      <Text style={styles.subTotal}>{rupiah(lineTotal)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.detailFooter, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>TOTAL PEMBELIAN</Text>
              <Text style={styles.totalRowValue} testID="detail-total">{rupiah(total)}</Text>
            </View>
            {editable ? (
              <Button title="SETUJUI & KIRIM KE POS" onPress={approve} loading={saving} icon="check-decagram" testID="approve-button" />
            ) : receipt.status === "approved" ? (
              <View style={styles.approvedNote}>
                <MaterialDesignIcons name="check-circle" size={20} color={colors.success} />
                <Text style={styles.approvedText}>Disetujui oleh {receipt.approved_by_name}</Text>
              </View>
            ) : (
              <View style={styles.approvedNote}>
                <MaterialDesignIcons name="clock-outline" size={20} color={colors.warning} />
                <Text style={styles.approvedText}>Menunggu audit admin</Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: {
    height: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onSurfaceSecondary },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardSupplier: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11 },
  cardStats: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  stat: { alignItems: "flex-start" },
  statValue: { fontFamily: fonts.display, fontSize: 19, color: c.onSurface },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  empty: { alignItems: "center", paddingTop: spacing["3xl"], gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, textAlign: "center", paddingHorizontal: spacing.xl },
  // detail
  detailRoot: { flex: 1, backgroundColor: c.surface },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  detailClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  detailTitle: { fontFamily: fonts.displaySemi, fontSize: 22, color: c.onSurface },
  detailMeta: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  detailBody: { padding: spacing.lg, gap: spacing.md },
  infoBanner: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: c.info },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceSecondary },
  detailRow: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: c.border },
  detailRowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detailName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  detailBarcode: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  qtyBadge: { backgroundColor: c.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  qtyBadgeText: { fontFamily: fonts.display, fontSize: 18, color: c.onBrandTertiary },
  priceRow: { flexDirection: "row", gap: spacing.sm },
  priceCol: { flex: 1 },
  priceLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted, marginBottom: 4 },
  lastPrice: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.onSurfaceSecondary },
  finalPrice: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.onSurface },
  subTotal: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.brandPrimary },
  costInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: spacing.sm, minHeight: 44 },
  rp: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginRight: 2 },
  costInput: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: c.onSurface, paddingVertical: 0 },
  detailFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, gap: spacing.md },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalRowLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.muted },
  totalRowValue: { fontFamily: fonts.display, fontSize: 28, color: c.brandPrimary },
  approvedNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md },
  approvedText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: c.onSurfaceSecondary },
}));
