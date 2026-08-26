# Spec 00 — Core

Load this for: stack questions, data model, scope boundaries.
Companion files: `01-schemas.md`, `02-runtime.md`, `03-delivery.md`.

`TASK.md` is the client brief and is authoritative on *what*. This spec is authoritative
on *how*. Where they conflict, flag it rather than silently resolving it.

Deadline: Sat 15 Aug 2026, 23:59.

---

## 1. What we are building

A single-page web app where a traveler chats with an AI travel advisor. Alongside the
chat, a **trip plan** takes shape as a structured, editable artifact. The advisor
remembers the traveler across separate conversations, fetches live data instead of
guessing, and its system prompt is editable from a settings page.

No authentication. Starts with `docker compose up` on a clean machine.

| # | Requirement (from TASK.md) | Solved in |
|---|---|---|
| R1 | Chat UI, advisor stays in role, coherent throughout | 02 §1 |
| R2 | Fetch live real-world info rather than guess | 02 §2 |
| R3 | Multiple conversations: new / list / open / delete | 00 §4 |
| R4 | Long conversations resumed over many sessions | 02 §3 |
| R5 | Continuity *across* conversations | 01 §4 |
| R6 | Structured trip plan, viewable and individually editable | 01 §2–3 |
| R7 | System prompt viewable/editable, effective immediately | 02 §1 |
| R8 | One command on a clean machine | 03 §1 |

---

## 2. Stack

- **Next.js 15** (App Router, `output: "standalone"`) — one process, UI + API.
- **Vercel AI SDK v5** — streaming, tool calling, `useChat`.
- **OpenRouter** as the LLM provider (see §3). Not the Anthropic API.
- **SQLite** (`better-sqlite3`) + **Drizzle ORM**, file on a mounted volume.
- **Zod 4** — one source of truth for tool schemas, API validation, and TS types.
- **Tailwind**, hand-rolled components. No component library.

### Why SQLite rather than Postgres

One service instead of two: no healthcheck, no `depends_on` ordering, no connection
pool, migration-on-boot is trivial. For a single-user demo it is sufficient, and a
one-service compose is a *better* answer to "must run with one command on a clean
machine". Postgres was the alternative; it buys nothing here and costs debugging time.
Record this in the README as a deliberate decision.

---

## 3. LLM provider — OpenRouter

The key supplied by the company is an **OpenRouter** key (`sk-or-v1-` prefix), not an
OpenAI key despite how the email described it. OpenRouter is OpenAI-API-compatible.

```
baseURL: https://openrouter.ai/api/v1
env:     OPENROUTER_API_KEY
```

Use `@openrouter/ai-sdk-provider`, or `createOpenAI` from `@ai-sdk/openai` with the base
URL overridden. Model slugs are `provider/model` form.

- Chat + tools: a Claude Sonnet class slug
- Titles + summarisation: a Claude Haiku class slug

**Day-one checks, before writing provider code:**

```bash
# exact current slugs
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models | jq '.data[].id' | grep anthropic

# remaining budget on the shared key
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/key
```

Do not hardcode slugs from memory — confirm them, then put them in one `lib/models.ts`
constant so a slug change is a one-line edit.

**Consequence:** the Anthropic server-side `web_search` tool is unavailable through
OpenRouter. Replacement in `02-runtime.md` §2.

**The key is shared and metered.** It is the company's budget. Cache tool results, keep
`max_results` low on search, and do not leave a loop hammering it.

---

## 4. Data model

```
traveler      id            text pk (uuid)
              profile       text (json)   -- TravelerProfile
              created_at

trip          id            text pk
              traveler_id   fk -> traveler
              plan          text (json)   -- TripPlan
              version       int           -- optimistic lock, bumped every write
              updated_at

conversation  id            text pk
              traveler_id   fk -> traveler
              trip_id       fk -> trip, NULLABLE
              title         text
              summary       text
              summarized_upto_message_id  text null
              created_at, updated_at

message       id            text pk
              conversation_id  fk -> conversation (on delete cascade)
              role          text          -- user | assistant
              parts         text (json)   -- full AI SDK part array
              created_at
              index (conversation_id, created_at)

settings      id            int pk = 1    -- single row
              persona_prompt  text
              updated_at
```

### Rules

- **`plan` hangs off `trip`, not off `conversation`.** The brief says a traveler plans
  *one trip across several conversations*. Many conversations → one trip. This is the
  most important structural decision in the project.
- **`conversation.trip_id` is nullable.** Conversations often start before a trip exists
  ("somewhere warm in October"). Create the trip lazily, on the first
  `update_trip_plan` call. Never auto-create empty trips.
- **One active trip per traveler.** The schema allows many; the app creates and links
  one. No trip switcher. Justified by the brief's own wording ("a *single* trip").
- **`message.parts` stores the complete AI SDK part array** — text, tool calls, and tool
  results together. Storing only text means a reloaded conversation hands the model a
  different history than it produced: it re-calls tools it already called, and tool
  chips cannot be re-rendered.
- **Hard delete** for conversations, cascading to messages. No `deleted_at`. Consistent
  with the privacy posture and easier to defend.
- Profile is a JSON column on `traveler`, not a second table.
- SQLite stores JSON as text. Always `JSON.parse` then `safeParse` — never `parse`
  (see `03-delivery.md` §5).

### Traveler identity without auth

On first request, set an `httpOnly`, `sameSite=lax` cookie holding a traveler UUID and
insert the row. Everything scopes to that id.

This is **not** authentication, and the README must say so: losing the cookie loses the
data, and anyone holding the cookie sees everything. Chosen over a single hardcoded
traveler so a reviewer gets a clean session and so "delete my data" means something.

---

## 5. Non-goals — do not build

Each is a documented decision in the README, not an oversight.

- Authentication, accounts, roles.
- Vector search / embeddings / RAG over past messages (reasoning in `01-schemas.md` §4).
- Booking, payments, any write to an external service.
- Rate limiting, observability, CI.
- Drag-and-drop plan reordering (see cut list, `03-delivery.md` §4).
- Coverage targets. Three tests only.
