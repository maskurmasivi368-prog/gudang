import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "gudang_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail ?? "Terjadi kesalahan";
    throw new ApiError(typeof detail === "string" ? detail : "Terjadi kesalahan", res.status);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};

// ---- Types ----
export type Role = "admin" | "staff";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}
export interface Supplier { id: string; name: string; phone: string }
export interface Product {
  id: string; barcode: string; name: string; stock: number; cost: number; price: number;
}
export interface ReceiptItem {
  product_id: string; barcode: string; name: string; qty: number; unit_cost: number; last_cost: number;
}
export interface Receipt {
  id: string;
  supplier_id: string;
  supplier_name: string;
  branch_id: string;
  branch_name: string;
  status: "pending_audit" | "approved";
  items: ReceiptItem[];
  created_by_name: string;
  created_at: string;
  submitted_at: string;
  approved_at: string | null;
  approved_by_name: string | null;
  total_qty: number;
  total_cost: number;
}
export interface LastCost {
  barcode: string; last_cost: number; last_supplier: string;
  last_purchased_at: string | null; found: boolean;
}
export interface Branch {
  id: string; name: string; code: string; address: string; is_main: boolean; active: boolean;
}
export interface TransferLine { product_id: string; barcode: string; name: string; qty: number }
export interface Transfer {
  id: string;
  from_branch_id: string; from_branch_name: string;
  to_branch_id: string; to_branch_name: string;
  status: "pending" | "received" | "cancelled";
  items: TransferLine[];
  note: string;
  total_qty: number;
  created_by_name: string;
  created_at: string;
  received_at: string | null;
  received_by_name: string | null;
}
export interface OpnameLine {
  product_id: string; barcode: string; name: string;
  system_qty: number; physical_qty: number; diff: number;
}
export interface Opname {
  id: string; branch_id: string; branch_name: string; status: string;
  items: OpnameLine[]; note: string; total_diff: number;
  created_by_name: string; created_at: string;
}
export interface IssueLine { product_id: string; barcode: string; name: string; qty: number }
export interface Issue {
  id: string; branch_id: string; branch_name: string; reason: string;
  items: IssueLine[]; note: string; total_qty: number;
  created_by_name: string; created_at: string;
}
export interface Movement {
  id: string; barcode: string; name: string; branch_id: string; branch_name: string;
  qty: number; type: string; note: string; user_name: string; created_at: string;
}
