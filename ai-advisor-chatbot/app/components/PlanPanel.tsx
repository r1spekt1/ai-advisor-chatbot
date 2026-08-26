"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Lock,
  MapPin,
  CalendarDays,
  Users,
  Wallet,
  Compass,
  Utensils,
  Car,
  BedDouble,
  StickyNote,
} from "lucide-react";
import type { TripPlan, PlanItem, PlanDay, Money, TripDates, PlanOp } from "@/lib/schema";

const KIND_LABELS: Record<PlanItem["kind"], string> = {
  activity: "Activity",
  food: "Food",
  transport: "Transport",
  lodging: "Lodging",
  note: "Note",
};

const KIND_ICONS: Record<PlanItem["kind"], typeof Compass> = {
  activity: Compass,
  food: Utensils,
  transport: Car,
  lodging: BedDouble,
  note: StickyNote,
};

const REJECTION_REASONS: Record<string, string> = {
  upsert_item: "an item edit was refused — it may have been removed elsewhere",
  remove_item: "an item couldn't be deleted — it may have been removed elsewhere",
  remove_day: "a day couldn't be removed — it may have been removed elsewhere",
  upsert_day: "a day edit was refused — it may have been removed elsewhere",
  upsert_destination: "a destination edit was refused — it may have been removed elsewhere",
  remove_destination: "a destination couldn't be removed — it may have been removed elsewhere",
};

const inputClass =
  "rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink outline-none " +
  "transition-colors duration-150 focus:border-accent";

function sectionTitle(text: string) {
  return <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{text}</h2>;
}

export default function PlanPanel({
  plan,
  version,
  onPlanChange,
}: {
  plan: TripPlan | null;
  version: number;
  onPlanChange: (plan: TripPlan, version: number) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function patch(ops: PlanOp[]) {
    setPending(true);
    try {
      const res = await fetch("/api/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, version }),
      });
      const data = await res.json();
      if (res.status === 409) {
        onPlanChange(data.plan, data.version);
        setNotice("The plan changed elsewhere — refreshed to the latest version. Please retry.");
        return;
      }
      if (!res.ok) {
        setNotice("Failed to save the change.");
        return;
      }
      onPlanChange(data.plan, data.version);
      const rejected: string[] = data.rejected ?? [];
      if (rejected.length > 0) {
        setNotice(
          "Some changes were refused: " +
            rejected.map((op) => REJECTION_REASONS[op] ?? op).join("; "),
        );
      } else {
        setNotice(null);
      }
    } catch {
      setNotice("Failed to save the change.");
    } finally {
      setPending(false);
    }
  }

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted">
        No trip yet — tell the advisor where you&apos;re going.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-paper p-4">
      <div className="mb-4 flex items-center justify-between">
        <TitleField
          title={plan.title}
          onCommit={(title) => void patch([{ op: "set_meta", title }])}
        />
        {pending && <span className="text-xs text-muted">Saving…</span>}
      </div>

      {notice && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          {notice}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
          <SummaryCell icon={MapPin} label="Destinations">
            {plan.destinations.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-sm text-ink">
                {plan.destinations.map((d) => (
                  <li key={d.id}>
                    {d.city}, {d.country}
                    {d.nights != null ? (
                      <span className="tabular-nums"> · {d.nights} nights</span>
                    ) : (
                      ""
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SummaryCell>

          <div className="h-px bg-line" />

          <SummaryCell icon={CalendarDays} label="Dates">
            <DatesSection
              dates={plan.dates}
              onCommit={(dates) => void patch([{ op: "set_dates", dates }])}
            />
          </SummaryCell>

          <div className="h-px bg-line" />

          <SummaryCell icon={Users} label="Party">
            <PartySection
              party={plan.party}
              onCommit={(party) => void patch([{ op: "set_party", party }])}
            />
          </SummaryCell>

          <div className="h-px bg-line" />

          <SummaryCell icon={Wallet} label="Budget">
            <BudgetSection
              budget={plan.budget}
              onCommit={(budget) => void patch([{ op: "set_budget", budget }])}
            />
          </SummaryCell>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            {sectionTitle("Days")}
            <button
              onClick={() => void patch([{ op: "upsert_day", day: {} }])}
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              Add day
            </button>
          </div>
          {plan.days.length === 0 ? (
            <p className="text-sm text-muted">No days yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {plan.days.map((day, i) => (
                <DayCard key={day.id} day={day} index={i} onPatch={patch} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
          {sectionTitle("Open questions")}
          {plan.openQuestions.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-ink">
              {plan.openQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCell({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Compass;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
  );
}

function TitleField({
  title,
  onCommit,
}: {
  title: string | null;
  onCommit: (title: string | null) => void;
}) {
  const [local, setLocal] = useState(title ?? "");
  useEffect(() => setLocal(title ?? ""), [title]);

  function commit() {
    const trimmed = local.trim();
    if (trimmed !== (title ?? "")) {
      onCommit(trimmed || null);
    }
  }

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      placeholder="Untitled trip"
      maxLength={120}
      className="font-serif-display w-full border-none bg-transparent text-[28px] font-semibold text-ink outline-none"
    />
  );
}

function DatesSection({
  dates,
  onCommit,
}: {
  dates: TripDates;
  onCommit: (dates: TripDates) => void;
}) {
  const [note, setNote] = useState(dates.note ?? "");
  useEffect(() => setNote(dates.note ?? ""), [dates.note]);

  function commitNote() {
    const trimmed = note.trim();
    if (trimmed !== (dates.note ?? "")) {
      onCommit({ ...dates, note: trimmed || null });
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dates.start ?? ""}
          onChange={(e) => onCommit({ ...dates, start: e.target.value || null })}
          className={`${inputClass} tabular-nums`}
        />
        <span className="text-muted">to</span>
        <input
          type="date"
          value={dates.end ?? ""}
          onChange={(e) => onCommit({ ...dates, end: e.target.value || null })}
          className={`${inputClass} tabular-nums`}
        />
        <label className="flex items-center gap-1 text-ink">
          <input
            type="checkbox"
            checked={dates.flexible}
            onChange={(e) => onCommit({ ...dates, flexible: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Flexible
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        placeholder="e.g. mid-October, around 10 days"
        maxLength={120}
        className={inputClass}
      />
    </div>
  );
}

function PartySection({
  party,
  onCommit,
}: {
  party: TripPlan["party"];
  onCommit: (party: TripPlan["party"]) => void;
}) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <label className="flex items-center gap-2 text-ink">
        Adults
        <input
          type="number"
          min={1}
          max={12}
          value={party.adults}
          onChange={(e) => {
            const adults = Math.min(12, Math.max(1, Number(e.target.value) || 1));
            onCommit({ ...party, adults });
          }}
          className={`${inputClass} w-16 tabular-nums`}
        />
      </label>
      <label className="flex items-center gap-2 text-ink">
        Children
        <input
          type="number"
          min={0}
          max={12}
          value={party.children}
          onChange={(e) => {
            const children = Math.min(12, Math.max(0, Number(e.target.value) || 0));
            onCommit({ ...party, children });
          }}
          className={`${inputClass} w-16 tabular-nums`}
        />
      </label>
    </div>
  );
}

function BudgetSection({
  budget,
  onCommit,
}: {
  budget: Money | null;
  onCommit: (budget: Money | null) => void;
}) {
  const current: Money = budget ?? { amount: null, currency: null, per: "total" };
  const [amount, setAmount] = useState(current.amount != null ? String(current.amount) : "");
  const [currency, setCurrency] = useState(current.currency ?? "");
  useEffect(() => {
    setAmount(current.amount != null ? String(current.amount) : "");
    setCurrency(current.currency ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.amount, current.currency]);

  function commitAmount() {
    const parsed = Number(amount);
    const nextAmount = amount.trim() && parsed > 0 ? parsed : null;
    if (nextAmount !== current.amount) {
      onCommit({ ...current, amount: nextAmount });
    }
  }

  function commitCurrency() {
    const upper = currency.trim().toUpperCase();
    const nextCurrency = /^[A-Z]{3}$/.test(upper) ? upper : null;
    setCurrency(nextCurrency ?? "");
    if (nextCurrency !== current.currency) {
      onCommit({ ...current, currency: nextCurrency });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={commitAmount}
        placeholder="Amount"
        className={`${inputClass} w-24 tabular-nums`}
      />
      <input
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        onBlur={commitCurrency}
        placeholder="EUR"
        maxLength={3}
        className={`${inputClass} w-16 uppercase`}
      />
      <select
        value={current.per}
        onChange={(e) => onCommit({ ...current, per: e.target.value as Money["per"] })}
        className={inputClass}
      >
        <option value="total">total</option>
        <option value="person">per person</option>
      </select>
    </div>
  );
}

function DayCard({
  day,
  index,
  onPatch,
}: {
  day: PlanDay;
  index: number;
  onPatch: (ops: PlanOp[]) => void;
}) {
  const [label, setLabel] = useState(day.label ?? "");
  const [showAdd, setShowAdd] = useState(false);
  useEffect(() => setLabel(day.label ?? ""), [day.label]);

  function commitLabel() {
    const trimmed = label.trim();
    if (trimmed !== (day.label ?? "")) {
      onPatch([{ op: "upsert_day", day: { id: day.id, label: trimmed || null } }]);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted tabular-nums">Day {index + 1}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            placeholder="Label (e.g. Arrival)"
            maxLength={120}
            className="font-serif-display rounded border-none bg-transparent px-1 py-0.5 text-base font-medium text-ink outline-none focus:bg-accent-soft"
          />
          {day.date && <span className="text-xs text-muted tabular-nums">{day.date}</span>}
        </div>
        <button
          onClick={() => onPatch([{ op: "remove_day", dayId: day.id }])}
          className="flex items-center gap-1 text-xs font-medium text-warn hover:underline"
        >
          <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
          Remove day
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {day.items.map((item) => (
          <ItemRow key={item.id} dayId={day.id} item={item} onPatch={onPatch} />
        ))}
      </div>

      {showAdd ? (
        <AddItemForm dayId={day.id} onPatch={onPatch} onDone={() => setShowAdd(false)} />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          Add item
        </button>
      )}
    </div>
  );
}

function ItemRow({
  dayId,
  item,
  onPatch,
}: {
  dayId: string;
  item: PlanItem;
  onPatch: (ops: PlanOp[]) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [time, setTime] = useState(item.time ?? "");
  const [location, setLocation] = useState(item.location ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  useEffect(() => setTitle(item.title), [item.title]);
  useEffect(() => setTime(item.time ?? ""), [item.time]);
  useEffect(() => setLocation(item.location ?? ""), [item.location]);
  useEffect(() => setNotes(item.notes ?? ""), [item.notes]);

  function commit(patch: Partial<{ title: string; time: string | null; location: string | null; notes: string | null }>) {
    onPatch([
      {
        op: "upsert_item",
        dayId,
        item: {
          id: item.id,
          title: patch.title ?? title,
          time: "time" in patch ? patch.time : time || null,
          location: "location" in patch ? patch.location : location || null,
          notes: "notes" in patch ? patch.notes : notes || null,
        },
      },
    ]);
  }

  const KindIcon = KIND_ICONS[item.kind];

  return (
    <div
      className={`flex flex-col gap-1 rounded-md bg-paper p-2 ${
        item.locked ? "border-l-2 border-accent" : "border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted" aria-hidden="true">
          <KindIcon size={16} strokeWidth={1.5} />
        </span>
        <span className="sr-only">{KIND_LABELS[item.kind]}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const trimmed = title.trim();
            if (trimmed && trimmed !== item.title) commit({ title: trimmed });
            else setTitle(item.title);
          }}
          maxLength={120}
          className="flex-1 border-none bg-transparent text-sm font-medium text-ink outline-none focus:bg-surface"
        />
        {item.locked && (
          <span
            title="Locked — you edited this by hand, so the advisor will not overwrite it."
            className="shrink-0 cursor-help text-muted"
          >
            <Lock size={16} strokeWidth={1.5} aria-label="Locked" />
          </span>
        )}
        <button
          onClick={() => onPatch([{ op: "remove_item", dayId, itemId: item.id }])}
          aria-label="Delete item"
          className="shrink-0 text-muted hover:text-warn"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => {
            const next = time || null;
            if (next !== item.time) commit({ time: next });
          }}
          className={`${inputClass} w-28 tabular-nums`}
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => {
            const trimmed = location.trim();
            const next = trimmed || null;
            if (next !== item.location) commit({ location: next });
          }}
          placeholder="Location"
          maxLength={120}
          className={`${inputClass} flex-1`}
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          const trimmed = notes.trim();
          const next = trimmed || null;
          if (next !== item.notes) commit({ notes: next });
        }}
        placeholder="Notes"
        maxLength={600}
        rows={1}
        className={`${inputClass} resize-none`}
      />
    </div>
  );
}

function AddItemForm({
  dayId,
  onPatch,
  onDone,
}: {
  dayId: string;
  onPatch: (ops: PlanOp[]) => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onPatch([{ op: "upsert_item", dayId, item: { title: trimmed } }]);
    setTitle("");
    onDone();
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        placeholder="New item title"
        maxLength={120}
        autoFocus
        className={`${inputClass} flex-1`}
      />
      <button
        onClick={submit}
        className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-paper transition-colors duration-150 hover:bg-accent/90"
      >
        Add
      </button>
      <button onClick={onDone} className="text-xs text-muted hover:underline">
        Cancel
      </button>
    </div>
  );
}
