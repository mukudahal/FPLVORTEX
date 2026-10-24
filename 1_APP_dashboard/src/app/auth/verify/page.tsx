"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function VerifyEmailPage() {
  const sent = useRef(false);
  const [message, setMessage] = useState("Verifying your account…");
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setMessage("Verification link is missing its token."); return; }
    void fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      const payload = await response.json() as { error?: string };
      setMessage(response.ok ? "Email verified. You can now sign in." : payload.error ?? "Could not verify this link.");
    }).catch(() => setMessage("Verification service unavailable."));
  }, []);
  return <section className="mx-auto mt-12 max-w-lg rounded-2xl border border-white/20 p-7">
    <h1 className="text-2xl font-bold">Email verification</h1><p role="status" className="my-4">{message}</p><Link className="underline" href="/login">Sign in</Link>
  </section>;
}
