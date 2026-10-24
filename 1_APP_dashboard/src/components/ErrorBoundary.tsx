"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  tabName: string;
  onRetry?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || "Unexpected rendering error in tab.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[FPL Vortex ErrorBoundary - ${this.props.tabName}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="my-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-center">
          <p className="text-sm font-bold text-rose-200">
            {this.props.tabName} encountered an error
          </p>
          <p className="mt-1 text-xs text-rose-300/90">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: null });
              this.props.onRetry?.();
            }}
            className="mt-3 rounded-full bg-gradient-to-r from-[#cda228] to-[#84d21c] px-4 py-1.5 text-xs font-extrabold text-[#000000]"
          >
            Retry {this.props.tabName}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function VerdictSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 animate-pulse"
      aria-busy="true"
      aria-label="Computing Verdict with MILP solver"
    >
      <div className="rounded-2xl border border-[#cda228]/25 bg-white/[0.04] p-4">
        <div className="mx-auto h-3 w-40 rounded bg-white/15" />
        <div className="mx-auto mt-2 h-8 w-48 rounded bg-[#cda228]/25" />
        <p className="mt-2 text-center text-xs text-slate-400">
          Running PuLP CBC MILP solver &amp; evaluating transfer options…
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="h-3 w-36 rounded bg-white/15" />
        <div className="mt-2 h-6 w-52 rounded bg-white/20" />
        <div className="mt-3 h-20 w-full rounded-xl bg-white/10" />
        <div className="mt-3 h-24 w-full rounded-xl bg-white/10" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="h-3 w-32 rounded bg-white/15" />
        <div className="mt-2 h-16 w-full rounded-xl bg-white/10" />
      </div>
    </div>
  );
}
