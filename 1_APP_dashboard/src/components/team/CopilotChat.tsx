"use client";

import { useRef, useState } from "react";
import { Card, ErrorBox, Pill } from "@/components/ui";

interface ChatMsg {
  role: "user" | "copilot";
  text: string;
  headline?: string;
  confidence?: number;
  sections?: { title: string; lines: string[] }[];
  navigateTo?: string[];
  aiNarrative?: string;
  model?: string;
}

const QUICK_PROMPTS = [
  "Best recommendation to win?",
  "Who should I captain?",
  "What transfer should I make?",
  "Should I play a chip?",
];

export function CopilotChat({
  teamId,
  onNavigate,
}: {
  teamId: string;
  onNavigate?: (tab: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "copilot",
      text: "Ask me anything — I'll answer from your live squad, xPts model and solver numbers.",
      headline: "🏆 Win Copilot ready",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQuestion = useRef<string>("");

  async function ask(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    lastQuestion.current = q;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setSending(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, question: q }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        headline?: string;
        confidence?: number;
        sections?: { title: string; lines: string[] }[];
        checklist?: string[];
        navigateTo?: string[];
        aiNarrative?: string | null;
        model?: string | null;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      if (!data?.headline) {
        setError("Not enough data — solver returned nothing usable. Retry in a minute.");
        return;
      }
      const headline = data.headline;
      const combined = (data.checklist ?? []).join("\n");
      setMessages((m) => [
        ...m,
        {
          role: "copilot" as const,
          text: combined || headline,
          headline,
          confidence: data.confidence,
          sections: data.sections,
          navigateTo: data.navigateTo,
          aiNarrative: data.aiNarrative ?? undefined,
          model: data.model ?? undefined,
        },
      ]);
    } catch (e) {
      console.error("[FPL Vortex CopilotChat send error]", e);
      setError(e instanceof Error ? e.message : "Network request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="border-[#cda228]/30 bg-gradient-to-r from-[#cda228]/10 to-[#84d21c]/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Last tab · Win Copilot
            </p>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              🏆 Best recommendation to win
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Optimizer-grounded answers for Team #{teamId}. GPT-6 Astra reasoning is available when enabled; estimates remain estimates.
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={sending}
              onClick={() => void ask(p)}
              className="rounded-full border border-[#cda228]/40 bg-black/40 px-3 py-1.5 text-xs font-bold text-[#dfc373] transition hover:bg-[#cda228]/20 disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl border p-3 text-sm ${
              m.role === "user"
                ? "self-end border-[#cda228]/40 bg-[#cda228]/15 text-white"
                : "border-white/10 bg-white/[0.05] text-slate-200"
            } max-w-[95%]`}
          >
            {m.headline && m.role === "copilot" ? (
              <p className="font-extrabold text-white">{m.headline}</p>
            ) : null}
            {typeof m.confidence === "number" ? (
              <Pill className="mt-1 bg-[#84d21c]/15 text-[#84d21c]">
                Estimate · {m.confidence}% confidence
              </Pill>
            ) : null}
            {m.aiNarrative ? (
              <div className="mt-3 rounded-xl border border-[#84d21c]/25 bg-[#84d21c]/[0.08] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#bbe682]">Model reasoning · {m.model}</p>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-100">{m.aiNarrative}</p>
              </div>
            ) : null}
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-snug">{m.text}</p>
            {m.sections?.map((s) => (
              <div key={s.title} className="mt-2 rounded-xl bg-black/30 p-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#dfc373]">
                  {s.title}
                </p>
                {s.lines.map((l, j) => (
                  <p key={j} className="mt-1 text-xs leading-snug text-slate-300">
                    • {l}
                  </p>
                ))}
              </div>
            ))}
            {m.navigateTo && m.navigateTo.length > 0 && onNavigate ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.navigateTo.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onNavigate(t)}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/20"
                  >
                    Open {t} →
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {sending ? (
          <div className="flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs text-slate-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-[#84d21c]" />
            Solving your best winning move…
          </div>
        ) : null}
      </div>

      {error ? (
        <ErrorBox
          message={error}
          onRetry={() => lastQuestion.current && void ask(lastQuestion.current)}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-20 flex gap-2 rounded-2xl border border-white/15 bg-black/70 p-2 backdrop-blur"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask: best recommendation to win?"
          maxLength={500}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#cda228] focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-xl bg-gradient-to-r from-[#cda228] to-[#84d21c] px-4 text-sm font-extrabold text-[#000000] transition hover:brightness-110 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
