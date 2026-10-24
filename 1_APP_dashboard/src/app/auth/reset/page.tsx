"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      const response = await fetch("/api/auth/reset", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not reset password.");
      setMessage("Password updated. Existing sessions have been revoked. Sign in again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Service unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto mt-12 max-w-md rounded-2xl border border-white/20 p-6">
    <h1 className="mb-6 text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-1">New password
        <input type="password" minLength={12} maxLength={256} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
      </label>
      <button disabled={busy} className="rounded-lg bg-amber-400 p-3 font-semibold text-black disabled:opacity-50">{busy ? "Saving…" : "Update password"}</button>
    </form>
    {message && <p className="my-4" role="status">{message}</p>}
    <Link href="/login" className="underline">Return to sign in</Link>
  </section>;
}
