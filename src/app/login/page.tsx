"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { FinavigLogo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button, Input } from "@/components/ui/primitives";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/components/providers/admin-auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, admin, loading: authLoading, refreshAuth } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"password" | "magic_link">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // If already authenticated and verified as admin, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user && admin) {
      router.push("/");
    }
  }, [authLoading, user, admin, router]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      if (!authData.session) {
        throw new Error("Failed to create session. Please try again.");
      }

      // Verify admin role via server API
      const res = await fetch("/api/admin-roles/me", {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`,
        },
      });

      const roleData = await res.json();
      if (!res.ok || !roleData.isAuthorized) {
        // Sign them back out if not an authorized admin
        await supabase.auth.signOut();
        throw new Error(
          roleData.error ?? "Access Denied: Your account does not have administrator privileges on finavig.",
        );
      }

      await refreshAuth();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your admin email address.");
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (otpError) {
        throw new Error(otpError.message);
      }

      setMagicLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-black text-slate-900 dark:text-zinc-100 transition-colors">
      {/* Top Bar with Theme Toggle */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FinavigLogo width={28} height={28} />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">finavig</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400 border border-[#0078D4]/20">
              Admin Portal
            </span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Login Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-8 shadow-xl dark:shadow-2xl dark:shadow-black/70">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0078D4]/10 text-[#0078D4] dark:text-blue-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Administrator Sign In
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Enter your administrative credentials to manage finavig operations, users, and platform data.
              </p>
            </div>

            {/* Error Banner */}
            {error ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 leading-relaxed">{error}</div>
              </div>
            ) : null}

            {/* Magic Link Sent Notice */}
            {magicLinkSent ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Check your inbox
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  A secure magic link has been sent to <span className="font-semibold text-slate-900 dark:text-white">{email}</span>. Click the link to complete sign in.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setMagicLinkSent(false)}
                >
                  Back to Password Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLinkLogin} className="mt-6 space-y-4">
                {/* Email Field */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Admin Email
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      type="email"
                      required
                      placeholder="admin@finavig.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 h-10 text-sm"
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Password Field (if mode === 'password') */}
                {mode === "password" ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setMode("magic_link")}
                        className="text-xs text-[#0078D4] dark:text-blue-400 hover:underline"
                      >
                        Use magic link instead
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9 pr-10 h-10 text-sm"
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMode("password")}
                      className="text-xs text-[#0078D4] dark:text-blue-400 hover:underline"
                    >
                      Use password sign in instead
                    </button>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 mt-2 text-sm font-semibold justify-center shadow-md shadow-[#0078D4]/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Verifying Administrator Privileges…
                    </>
                  ) : mode === "password" ? (
                    <>
                      Sign In to Console
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  ) : (
                    <>
                      Send Magic Link
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Security Notice */}
            <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800/80 text-center">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <Lock className="h-3 w-3 text-emerald-500" />
                <span>Protected by Supabase Auth &amp; Two-Tier RBAC</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-zinc-500 dark:text-zinc-500 border-t border-zinc-200/80 dark:border-zinc-800/80">
        finavig Financial Intelligence &amp; Document Expiry Admin Platform · Authorized Personnel Only
      </footer>
    </div>
  );
}
