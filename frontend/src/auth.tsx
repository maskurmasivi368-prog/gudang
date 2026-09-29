import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  PosSession,
  PosUser,
  loadSession,
  saveSession,
  clearSession,
  posLogin,
  me,
  onUnauthorized,
} from "@/src/pos";

interface AuthState {
  session: PosSession | null;
  user: PosUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  // 401 anywhere in the adapter ends the local session.
  useEffect(() => {
    onUnauthorized(() => setSession(null));
  }, []);

  const bootstrap = useCallback(async () => {
    const saved = await loadSession();
    if (!saved) {
      setLoading(false);
      return;
    }
    setSession(saved);
    // Verify identity fresh; failures fall back to the saved session when the
    // network is down, or force logout on 401 (adapter already cleared it).
    try {
      const fresh = await me();
      const next = { ...saved, user: fresh };
      await saveSession(next);
      setSession(next);
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await posLogin(email.trim(), password);
    const u = res.user;
    if (!u.active || !u.store_id || (u.role !== "warehouse" && u.role !== "admin")) {
      throw new Error("Akun ini tidak berhak memakai aplikasi PDA (butuh peran gudang/admin dan cabang)");
    }
    const sess: PosSession = { access_token: res.access_token, user: u };
    await saveSession(sess);
    setSession(sess);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
