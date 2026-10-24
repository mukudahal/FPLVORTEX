"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

interface User { id: string; email: string; displayName: string; role: string }
interface Manager { entry_id: number; nickname: string; is_primary: boolean }

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryId, setEntryId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (data: { user: User | null }) => {
        if (!active) return;
        setUser(data.user);
        if (data.user) {
          const result = await fetch("/api/auth/manager", { cache: "no-store" });
          if (result.ok && active) setManagers((await result.json() as { managers: Manager[] }).managers);
        }
      }).catch(() => active && setMessage("Account service unavailable."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  async function linkManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/manager", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entryId: Number(entryId) }),
    });
    if (!response.ok) { setMessage("Could not add manager."); return; }
    const payload = await response.json() as { manager: Manager };
    setManagers((current) => [...current.filter((item) => item.entry_id !== payload.manager.entry_id), payload.manager]);
    setEntryId(""); setMessage("Manager added to your watchlist.");
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  if (loading) return <p role="status" className="p-8">Loading account…</p>;
  if (!user) return <section className="mx-auto mt-12 max-w-lg p-6"><h1 className="text-2xl font-bold">Account</h1>
    <p className="my-4">Sign in to save scenarios, manage your watchlist and run private simulations.</p>
    <div className="flex gap-5 underline"><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></div>{message && <p role="alert">{message}</p>}</section>;
  return <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-white/20 p-6">
    <h1 className="text-2xl font-bold">Account</h1>
    <p className="mt-2">{user.displayName || user.email}</p>
    <p className="text-sm opacity-70">{user.email}</p>
    <h2 className="mt-8 text-xl font-bold">Tracked FPL managers</h2>
    <p className="mb-4 text-sm opacity-70">Adding a public manager ID to your watchlist does not prove account ownership.</p>
    <ul className="space-y-2">{managers.map((manager) => <li key={manager.entry_id}>
      <Link className="underline" href={`/team/${manager.entry_id}`}>{manager.nickname || `Manager ${manager.entry_id}`}</Link>
    </li>)}</ul>
    <form onSubmit={linkManager} className="mt-5 flex gap-2">
      <label className="grid flex-1 gap-1 text-sm">FPL manager ID
        <input type="number" min={1} required value={entryId} onChange={(event) => setEntryId(event.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
      </label>
      <button className="self-end rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">Add</button>
    </form>
    {message && <p role="status" className="my-3 text-sm">{message}</p>}
    <button onClick={logout} className="mt-8 rounded-lg border border-white/20 px-4 py-2">Sign out</button>
  </section>;
}
