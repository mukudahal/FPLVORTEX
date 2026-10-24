import { readPublicSiteUrl } from "@/lib/runtimeConfig";

export type EmailPurpose = "verify" | "reset";

export function mailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_FROM_EMAIL);
}

export async function sendAuthEmail(email: string, token: string, purpose: EmailPurpose): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;
  if (!key || !from) throw new Error("Email sender is not configured.");
  const actionUrl = new URL(purpose === "verify" ? "/auth/verify" : "/auth/reset", readPublicSiteUrl());
  actionUrl.searchParams.set("token", token);
  const subject = purpose === "verify" ? "Verify your FPL VORTEX account" : "Reset your FPL VORTEX password";
  const instruction = purpose === "verify" ? "Verify your account" : "Reset your password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject, text: `${instruction}: ${actionUrl.toString()}\n\nIgnore this message if you did not request it.` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider declined the request (${response.status}).`);
}
