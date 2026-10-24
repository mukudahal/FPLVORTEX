"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props { mode: "register" | "login" | "forgot" }

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const title = mode === "register" ? "Create your account" : mode === "login" ? "Sign in" : "Reset your password";
  const endpoint = mode === "forgot" ? "/api/auth/request-reset" : `/api/auth/${mode}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, ...(mode !== "forgot" ? { password } : {}), ...(mode === "register" ? { displayName } : {}) }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Request failed.");
      if (mode === "login") {
        router.push("/account");
        router.refresh();
        return;
      }
      setMessage(body.message ?? "Check your email for a link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete your request.");
    } finally { setBusy(false); }
  }
  return (
    <section className="mx-auto mt-10 max-w-md rounded-2xl border border-white/15 bg-white/5 p-6">
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      <form onSubmit={submit} className="grid gap-4">
        {mode === "register" && <label className="grid gap-1 text-sm">Display name
          <input autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
        </label>}
        <label className="grid gap-1 text-sm">Email
          <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
        </label>
        {mode !== "forgot" && <label className="grid gap-1 text-sm">Password
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
        </label>}
        <button disabled={busy} className="rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black disabled:opacity-50">{busy ? "Working…" : title}</button>
        {message && <p role="status" className="text-sm">{message}</p>}
      </form>
      <div className="mt-5 flex flex-wrap gap-4 text-sm underline underline-offset-4">
        {mode !== "login" && <Link href="/login">Sign in</Link>}
        {mode !== "register" && <Link href="/register">Register</Link>}
        {mode !== "forgot" && <Link href="/auth/forgot">Forgot password?</Link>}
      </div>
    </section>
  );
}
