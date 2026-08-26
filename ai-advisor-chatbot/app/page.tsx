"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Streamdown } from "streamdown";
import Link from "next/link";
import {
  Plus,
  Send,
  Trash2,
  CloudSun,
  ArrowLeftRight,
  Search,
  MapPinned,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import "streamdown/styles.css";
import type { TripPlan } from "@/lib/schema";
import PlanPanel from "./components/PlanPanel";

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TOOL_STATUS: Record<string, { icon: LucideIcon; label: string }> = {
  getWeather: { icon: CloudSun, label: "Checking the weather" },
  getExchangeRate: { icon: ArrowLeftRight, label: "Checking exchange rates" },
  webSearch: { icon: Search, label: "Searching the web" },
  updateTripPlan: { icon: MapPinned, label: "Updating your plan" },
  remember: { icon: BookMarked, label: "Saving what I learned" },
};

function ToolCallRow({ toolName, pending }: { toolName: string; pending: boolean }) {
  const entry = TOOL_STATUS[toolName];
  if (!entry) return null;
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-muted">
      <Icon
        size={14}
        strokeWidth={1.5}
        aria-hidden="true"
        className={pending ? "animate-pulse" : ""}
      />
      {entry.label}
    </div>
  );
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <aside className="flex w-full shrink-0 flex-col bg-surface md:w-64 md:border-r md:border-line">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent/90"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          New conversation
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group mb-1 flex items-center gap-1 rounded-lg px-2 py-2 transition-colors duration-150 ${
              c.id === activeId ? "bg-accent-soft" : "hover:bg-paper"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
              title={c.title}
            >
              <span className="w-full truncate text-sm text-ink">
                {c.title || "New conversation"}
              </span>
              <span className="text-xs text-muted">{formatRelativeTime(c.updatedAt)}</span>
            </button>
            {confirmingId === c.id ? (
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setConfirmingId(null);
                    onDelete(c.id);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-warn hover:bg-warn/10"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingId(c.id)}
                aria-label="Delete conversation"
                className="shrink-0 rounded p-1 text-muted opacity-0 transition-colors duration-150 hover:bg-line/60 hover:text-warn group-hover:opacity-100"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChatView({
  conversationId,
  initialMessages,
  onMessageFinish,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  onMessageFinish: () => void;
}) {
  const [input, setInput] = useState("");
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const transportRef = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ conversationId: conversationIdRef.current }),
    }),
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: transportRef.current,
    onFinish: () => {
      onMessageFinish();
      // Title generation runs asynchronously after the response finishes; refresh again
      // shortly after to pick it up without requiring a manual reload.
      setTimeout(onMessageFinish, 2500);
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask about a destination, a route, or anything you&apos;re planning for your next
            trip.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-accent-soft px-4 py-2 text-[17px] text-ink"
                  : "prose-chat max-w-[80%] text-[17px] text-ink"
              }
            >
              {m.parts.map((part, i) => {
                if (isToolUIPart(part)) {
                  const toolName = part.type.slice("tool-".length);
                  const pending =
                    part.state === "input-streaming" || part.state === "input-available";
                  return <ToolCallRow key={i} toolName={toolName} pending={pending} />;
                }
                if (part.type !== "text") return null;
                return m.role === "user" ? (
                  <span key={i}>{part.text}</span>
                ) : (
                  <Streamdown key={i}>{part.text}</Streamdown>
                );
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-0 py-2 text-[17px] text-muted">Thinking…</div>
          </div>
        )}

        {error && (
          <p className="text-sm text-warn">{error.message || "Something went wrong. Please try again."}</p>
        )}
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 mx-auto flex w-full max-w-2xl gap-2 border-t border-line bg-paper px-4 py-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your travel advisor…"
          disabled={isBusy}
          className="flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink outline-none transition-colors duration-150 focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent/90 disabled:opacity-40"
        >
          Send
          <Send size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

export default function Home() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  const [mobileTab, setMobileTab] = useState<"conversations" | "chat" | "plan">("chat");

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data: ConversationSummary[] = await res.json();
    setConversations(data);
    return data;
  }, []);

  const refreshPlan = useCallback(async () => {
    const res = await fetch("/api/plan");
    if (!res.ok) return;
    const data: { plan: TripPlan; version: number } | null = await res.json();
    if (data) {
      setPlan(data.plan);
      setPlanVersion(data.version);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await refreshConversations();
      if (data && data.length > 0) {
        void selectConversation(data[0].id);
      }
    })();
    void refreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectConversation(id: string) {
    setLoadingMessages(true);
    setActiveId(id);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) {
        const rows: { id: string; role: "user" | "assistant"; parts: unknown[] }[] =
          await res.json();
        setInitialMessages(
          rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage),
        );
      } else {
        setInitialMessages([]);
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleNew() {
    const res = await fetch("/api/conversations", { method: "POST" });
    if (!res.ok) return;
    const created: ConversationSummary = await res.json();
    setConversations((prev) => [created, ...prev]);
    setActiveId(created.id);
    setInitialMessages([]);
    setMobileTab("chat");
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      if (remaining.length > 0) {
        void selectConversation(remaining[0].id);
      } else {
        setActiveId(null);
        setInitialMessages([]);
      }
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <h1 className="font-serif-display text-xl font-semibold text-ink">Travel Advisor</h1>
        <div className="flex items-center gap-4">
          <Link href="/profile" className="text-sm text-muted hover:text-accent hover:underline">
            Profile
          </Link>
          <Link href="/settings" className="text-sm text-muted hover:text-accent hover:underline">
            Settings
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className={`min-h-0 flex-1 md:flex-none ${mobileTab === "conversations" ? "flex" : "hidden"} md:flex`}
        >
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => {
              void selectConversation(id);
              setMobileTab("chat");
            }}
            onNew={handleNew}
            onDelete={handleDelete}
          />
        </div>

        <div
          className={`min-h-0 flex-1 flex-col ${mobileTab === "conversations" ? "hidden" : "flex"} md:flex`}
        >
          <div className="flex border-b border-line bg-surface md:hidden">
            <button
              onClick={() => setMobileTab("conversations")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                mobileTab === "conversations"
                  ? "border-b-2 border-accent text-ink"
                  : "text-muted"
              }`}
            >
              Conversations
            </button>
            <button
              onClick={() => setMobileTab("chat")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                mobileTab === "chat"
                  ? "border-b-2 border-accent text-ink"
                  : "text-muted"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setMobileTab("plan")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                mobileTab === "plan"
                  ? "border-b-2 border-accent text-ink"
                  : "text-muted"
              }`}
            >
              Plan
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            <div
              className={`min-h-0 flex-1 flex-col ${mobileTab === "chat" ? "flex" : "hidden"} md:flex`}
            >
              {activeId && !loadingMessages ? (
                <ChatView
                  key={activeId}
                  conversationId={activeId}
                  initialMessages={initialMessages}
                  onMessageFinish={() => {
                    void refreshConversations();
                    void refreshPlan();
                  }}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted">
                  {loadingMessages ? "Loading…" : "Start a new conversation to begin."}
                </div>
              )}
            </div>

            <div
              className={`min-h-0 w-full flex-col border-line md:flex md:w-[400px] md:shrink-0 md:border-l ${
                mobileTab === "plan" ? "flex" : "hidden"
              }`}
            >
              <PlanPanel
                plan={plan}
                version={planVersion}
                onPlanChange={(nextPlan, nextVersion) => {
                  setPlan(nextPlan);
                  setPlanVersion(nextVersion);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
