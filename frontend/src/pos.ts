// MASIVI POS adapter — single source of truth for all PDA warehouse data.
// Contract: /app/memory/POS-GUDANG-API.md + POS-GUDANG-API.openapi.json
// Base URL = EXPO_PUBLIC_POS_ORIGIN + EXPO_PUBLIC_POS_API_PATH (joined exactly once).

import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const ORIGIN = (process.env.EXPO_PUBLIC_POS_ORIGIN || "").replace(/\/+$/, "");
const API_PATH =
  "/" + (process.env.EXPO_PUBLIC_POS_API_PATH || "/api/v1").replace(/^\/+|\/+$/g, "");
export const POS_BASE = `${ORIGIN}${API_PATH}`;

// Web preview runs on an Emergent origin that the POS CORS policy does not
// allow, so on web we route through the read-through proxy on our backend.
// Native (the real PDA target) always calls the POS directly.
const WEB_PROXY = process.env.EXPO_PUBLIC_BACKEND_URL
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/+$/, "")}/api/pos-proxy`
  : null;
const BASE = Platform.OS === "web" && WEB_PROXY ? WEB_PROXY : POS_BASE;

const SESSION_KEY = "pos_session_v1";

// ---- Types (fields beyond these may exist; never discard unknown fields) ----
export interface PosUser {
  id: string;
  email: string;
  name: string;
  role: string; // "warehouse" | "admin" | other POS roles
  active: boolean;
  store_id: string;
  cashier_duty?: string;
}
export interface PosSession {
  access_token: string;
  user: PosUser;
}
export interface PosStore { id: string; name: string }
export interface PosSupplier { id: string; name: string }

export interface UnitConv { name: string; pieces: number }

export interface ProductScan {
  id: string;
  name: string;
  barcode?: string;
  base_unit: string;
  units: UnitConv[];
  receiving_packages?: { name: string; pieces: number; barcode: string }[];
  variants: unknown[];
  supplier_price?: number | null;
  matched_unit: string | null;
  matched_pieces?: number | null;
  matched_variant?: unknown;
  stock?: number;
  cost?: number;
  last_purchase_cost?: number;
  supplier_name?: string;
  supplier_id?: string | null;
}

export interface BatchItem {
  product_id: string;
  product_name?: string;
  barcode?: string;
  base_unit?: string;
  units?: UnitConv[];
  quantity: number;
  unit: string;
  pieces: number;
  quantity_base?: number;
  condition: string;
  variant: unknown;
  cost?: number | null;
  good_quantity_base?: number;
}

export interface Batch {
  id: string;
  kind: string;
  request_id?: string;
  supplier_id: string;
  supplier_name: string;
  reference: string;
  note: string;
  items: BatchItem[];
  state: string; // draft | purchase_pending | purchased | cancelled
  revision: number;
  store_id: string;
  user_id: string;
  by?: string;
  created_at: string;
  updated_at: string;
}

export interface TransferProduct {
  id: string;
  name: string;
  stock?: number;
  cost?: number;
  units: UnitConv[];
  matched_unit: string | null;
  exact?: boolean;
}

export interface TransferOptions {
  active_store: string;
  can_edit: boolean;
  can_finance: boolean;
  stores: PosStore[];
}

export interface TransferItem {
  product_id: string;
  name?: string;
  base_unit?: string;
  unit: string;
  pieces: number;
  qty: number;
  unit_cost?: number;
  sent_qty?: number;
  original_sent_qty?: number;
  received_qty?: number;
}

export interface TransferTotals {
  original_sent_value?: number;
  draft_value?: number;
  sent_value?: number;
  received_value?: number;
  difference_value?: number;
  final_value?: number;
  recorded_value?: number;
  unrecorded_value?: number;
}

export interface TransferDoc {
  id: string;
  kind?: string;
  request_no: string;
  from_store: string;
  from_store_name: string;
  to_store: string;
  to_store_name: string;
  state: string; // draft | shipped | receipt_draft | partial_received | received | cancelled
  revision: number;
  note?: string;
  created_at: string;
  updated_at: string;
  items?: TransferItem[];
  item_count: number;
  totals?: TransferTotals;
  pending_receipt?: unknown;
}

// ---- Errors ----
export class PosError extends Error {
  status: number;
  body: unknown;
  network: boolean;
  constructor(message: string, status: number, body?: unknown, network = false) {
    super(message);
    this.status = status;
    this.body = body;
    this.network = network;
  }
}

// ---- Session (token in SecureStore, never AsyncStorage) ----
export async function saveSession(s: PosSession) {
  await storage.secureSet(SESSION_KEY, JSON.stringify(s));
}
export async function loadSession(): Promise<PosSession | null> {
  const raw = await storage.secureGet<string>(SESSION_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PosSession;
  } catch {
    return null;
  }
}
export async function clearSession() {
  await storage.secureRemove(SESSION_KEY);
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

// ---- Stable UUID for request_id (created once per logical action) ----
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- Core fetch ----
export async function posFetch<T>(
  path: string,
  init: RequestInit = {},
  withAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (withAuth) {
    const s = await loadSession();
    if (s) {
      headers["Authorization"] = `Bearer ${s.access_token}`;
      headers["X-Store-Id"] = s.user.store_id;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path.replace(/^\/+/, "")}`, { ...init, headers });
  } catch {
    // timeout/offline: server may already have stored the request — retry must
    // reuse the SAME request_id, which the journal guarantees.
    throw new PosError("Tidak dapat terhubung ke server POS", 0, undefined, true);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // non-JSON (proxy/rate-limit pages)
  }

  if (res.status === 401 && withAuth) {
    await clearSession();
    unauthorizedHandler?.();
    throw new PosError("Sesi berakhir, silakan login ulang", 401, body);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (body && typeof body === "object" && "detail" in (body as Record<string, unknown>)) {
      const d = (body as { detail: unknown }).detail;
      msg =
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? d.map((x) => (x as { msg?: string }).msg || "").filter(Boolean).join(", ")
            : JSON.stringify(d);
    }
    throw new PosError(msg, res.status, body);
  }
  return body as T;
}

// ---- Auth ----
export function posLogin(email: string, password: string) {
  return posFetch<{ access_token: string; token_type: string; user: PosUser }>(
    "auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false,
  );
}
export const me = () => posFetch<PosUser>("auth/me");
export const health = () =>
  posFetch<{ status: string; database: string; api_version: string }>("health", {}, false);
export const listStores = () => posFetch<PosStore[]>("stores");

// ---- Warehouse ----
export const listSuppliers = () => posFetch<PosSupplier[]>("warehouse/suppliers");
export const scanProduct = (barcode: string) =>
  posFetch<ProductScan>(`warehouse/product?barcode=${encodeURIComponent(barcode)}`);
export const searchProducts = (q: string) =>
  posFetch<{ items: ProductScan[]; has_more: boolean }>(
    `warehouse/products?q=${encodeURIComponent(q)}`,
  );
export const getProductById = (id: string) =>
  posFetch<ProductScan>(`warehouse/product?product_id=${encodeURIComponent(id)}`);

export const listBatches = () => posFetch<Batch[]>("warehouse/batches");
export const getBatch = (id: string) => posFetch<Batch>(`warehouse/batches/${id}`);

export interface ScanNoteInput {
  kind: "warehouse" | "transfer";
  context_id: string;
  barcode: string;
  document_id?: string | null;
  target_store?: string | null;
}
export function postScanNote(input: ScanNoteInput) {
  return posFetch("warehouse/scan-notes", {
    method: "POST",
    body: JSON.stringify({ request_id: uuid(), ...input }),
  });
}

// ---- Branch transfers ----
export const transferOptions = () => posFetch<TransferOptions>("branch-transfers/options");
export const transferSearch = (q: string) =>
  posFetch<TransferProduct[]>(`branch-transfers/products?q=${encodeURIComponent(q)}`);
export const listTransfers = (direction: "outgoing" | "incoming") =>
  posFetch<{ items: TransferDoc[]; total: number }>(
    `branch-transfers?direction=${direction}`,
  );
export const getTransfer = (id: string) => posFetch<TransferDoc>(`branch-transfers/${id}`);
