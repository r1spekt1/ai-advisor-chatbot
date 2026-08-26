"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

type Profile = {
  schemaVersion: 1;
  homeCity: string | null;
  homeCountry: string | null;
  homeCurrency: string | null;
  languages: string[];
  interests: string[];
  dietary: string[];
  avoid: string[];
  pace: string | null;
  accommodation: string | null;
  budgetBand: string | null;
  companions: { id: string; relation: string; ageBand: string | null; note: string | null }[];
};

const FIELD_LABELS: Record<string, string> = {
  homeCity: "Home city",
  homeCountry: "Home country",
  homeCurrency: "Home currency",
  languages: "Languages",
  interests: "Interests",
  dietary: "Dietary",
  avoid: "Avoids",
  pace: "Pace",
  accommodation: "Accommodation",
  budgetBand: "Budget band",
  companions: "Companions",
};

function formatValue(value: unknown): string | null {
  if (value === null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (typeof value[0] === "object") {
      return value
        .map((c: Profile["companions"][number]) =>
          [c.relation, c.ageBand, c.note].filter(Boolean).join(" · "),
        )
        .join(", ");
    }
    return value.join(", ");
  }
  return String(value);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/profile");
    if (res.ok) setProfile(await res.json());
    setLoading(false);
  }

  async function deleteField(key: string) {
    const res = await fetch(`/api/profile/field/${key}`, { method: "DELETE" });
    if (res.ok) setProfile(await res.json());
  }

  async function deleteAll() {
    const res = await fetch("/api/profile", { method: "DELETE" });
    if (res.ok) setProfile(await res.json());
  }

  if (loading || !profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper text-sm text-muted">
        Loading…
      </div>
    );
  }

  const entries = Object.entries(FIELD_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      value: formatValue(profile[key as keyof Profile]),
    }))
    .filter((entry) => entry.value !== null);

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <h1 className="font-serif-display text-xl font-semibold text-ink">Your Profile</h1>
        <Link href="/" className="text-sm text-muted hover:text-accent hover:underline">
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-muted">
          This is what the advisor remembers about you across conversations. You can delete any
          individual detail, or clear everything.
        </p>

        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing remembered yet — chat with the advisor and it will fill in over time.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {entries.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted">{entry.label}</span>
                  <span className="text-sm text-ink">{entry.value}</span>
                </div>
                <button
                  onClick={() => void deleteField(entry.key)}
                  aria-label={`Delete ${entry.label}`}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-warn hover:underline"
                >
                  <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        {entries.length > 0 && (
          <button
            onClick={() => void deleteAll()}
            className="self-start rounded-full border border-warn px-5 py-2 text-sm font-medium text-warn transition-colors duration-150 hover:bg-warn/10"
          >
            Delete everything
          </button>
        )}
      </main>
    </div>
  );
}
