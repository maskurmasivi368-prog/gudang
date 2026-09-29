import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { storage } from "@/src/utils/storage";
import { api, Branch } from "@/src/api";
import { useAuth } from "@/src/auth";

const BRANCH_KEY = "gudang_branch_id";

interface BranchState {
  branches: Branch[];
  current: Branch | null;
  currentId: string | null;
  setCurrentId: (id: string) => void;
  loading: boolean;
  refetch: () => void;
}

const Ctx = createContext<BranchState | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentId, setCurrentIdState] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
    enabled: !!user,
  });

  const branches = data ?? [];

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(BRANCH_KEY, "");
      if (saved) setCurrentIdState(saved);
    })();
  }, []);

  // Default to main branch once loaded and nothing chosen / invalid choice.
  useEffect(() => {
    if (branches.length === 0) return;
    const valid = currentId && branches.some((b) => b.id === currentId);
    if (!valid) {
      const main = branches.find((b) => b.is_main) ?? branches[0];
      setCurrentIdState(main.id);
    }
  }, [branches, currentId]);

  const setCurrentId = (id: string) => {
    setCurrentIdState(id);
    storage.setItem(BRANCH_KEY, id);
  };

  const current = branches.find((b) => b.id === currentId) ?? null;

  return (
    <Ctx.Provider value={{ branches, current, currentId, setCurrentId, loading: isLoading, refetch }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
