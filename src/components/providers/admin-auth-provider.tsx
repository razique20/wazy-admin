"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { type AdminRecord, type AdminRole } from "@/lib/admins";

interface AdminAuthContextValue {
  user: User | null;
  session: Session | null;
  admin: AdminRecord | null;
  role: AdminRole | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const verifyAdminRole = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.access_token) {
      setAdmin(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin-roles/me", {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.isAuthorized && data.admin) {
        setAdmin(data.admin);
        setError(null);
      } else {
        setAdmin(null);
        setError(data.error ?? "Unauthorized admin access");
      }
    } catch (err) {
      setAdmin(null);
      setError(err instanceof Error ? err.message : "Network error verifying admin status");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    await verifyAdminRole(data.session);
  }, [verifyAdminRole]);

  useEffect(() => {
    let mounted = true;

    // Initial session load
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      verifyAdminRole(data.session);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      verifyAdminRole(newSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [verifyAdminRole]);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAdmin(null);
    setError(null);
    setLoading(false);
    router.push("/login");
  }, [router]);

  // Route protection: redirect unauthenticated or unauthorized users to /login
  useEffect(() => {
    if (loading) return;

    const isLoginPage = pathname === "/login";

    // If logged out or unauthorized and NOT on /login, redirect to /login immediately!
    if (!isLoginPage && (!user || !admin)) {
      router.replace("/login");
      return;
    }

    // If on /login and already verified as admin, redirect to dashboard
    if (isLoginPage && user && admin) {
      router.replace("/");
    }
  }, [loading, user, admin, pathname, router]);

  const role = admin?.role ?? null;
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "super_admin" || role === "admin";

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        session,
        admin,
        role,
        loading,
        isSuperAdmin,
        isAdmin,
        error,
        signOut,
        refreshAuth,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return ctx;
}
