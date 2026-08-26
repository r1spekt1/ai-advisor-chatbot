"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [persona, setPersona] = useState("");
  const [defaultPersona, setDefaultPersona] = useState("");
  const [composedPrompt, setComposedPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [settingsRes, defaultRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/default"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setPersona(data.persona);
        setComposedPrompt(data.composedPrompt);
      }
      if (defaultRes.ok) {
        const data = await defaultRes.json();
        setDefaultPersona(data.persona);
      }
      setLoading(false);
    })();
  }, []);

  async function save(nextPersona: string) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: nextPersona }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ? "Persona must be 1–4000 characters." : "Failed to save.");
        return;
      }
      const data = await res.json();
      setPersona(data.persona);
      setComposedPrompt(data.composedPrompt);
      setSaved(true);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save(persona);
  }

  function handleReset() {
    if (!defaultPersona) return;
    setPersona(defaultPersona);
    void save(defaultPersona);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <h1 className="font-serif-display text-xl font-semibold text-ink">Advisor Settings</h1>
        <Link href="/" className="text-sm text-muted hover:text-accent hover:underline">
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-muted">
          The role contract and tool contract are fixed and cannot be edited here. Only the
          persona below — tone, style, and verbosity — is editable.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="persona" className="text-sm font-medium text-ink">
            Persona
          </label>
          <textarea
            id="persona"
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              setSaved(false);
            }}
            maxLength={4000}
            rows={6}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors duration-150 focus:border-accent"
          />
          <div className="flex items-center justify-between text-xs text-muted tabular-nums">
            <span>{persona.length} / 4000</span>
            {saved && <span className="text-accent">Saved</span>}
          </div>

          {error && <p className="text-sm text-warn">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !persona.trim()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent/90 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface disabled:opacity-40"
            >
              Reset to default
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink">Full composed prompt (read-only)</h2>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-line/20 p-3 font-mono text-xs text-muted">
            {composedPrompt}
          </pre>
        </div>
      </main>
    </div>
  );
}
