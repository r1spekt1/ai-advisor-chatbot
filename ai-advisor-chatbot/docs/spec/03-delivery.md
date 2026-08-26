# Spec 03 — Delivery

Load this for: docker, build order, what to cut, README, working conventions.

---

## 1. Running it

`docker compose up`, one service. SQLite file on a named volume so data survives a
restart.

- Multi-stage Dockerfile, Next `output: "standalone"`.
- `better-sqlite3` is a native module — build it in the builder stage and confirm the
  runtime stage has a matching architecture. This is the one likely Docker failure; test
  it early, not on Saturday.
- **Migrations run in the entrypoint**, before `next start`. A reviewer meeting a missing
  table is a failed submission.
- `.env.example` with `OPENROUTER_API_KEY=`. README step one is `cp .env.example .env`.
- **The key never enters git.** `.env` in `.gitignore`. Before the final commit:
  `git log -p | grep -i "sk-or-v1"` must return nothing.

**Write the Docker setup by hand.** Iterating on a compose file with an agent that
cannot run `docker compose up` is the most expensive way to solve something you can solve
yourself in an hour.

---

## 2. Tests

Three, and only three. Each is a pure function; each covers something worth defending in
an interview.

1. `applyOps` refuses to modify or remove a `locked` item, and reports it in `rejected`.
2. `RememberArgs` rejects an unknown key — the schema-as-denylist guarantee.
3. `SearchArgs` rejects a query containing a long digit sequence.

Vitest. No coverage target.

---

## 3. Build order

**Phase 0 — foundations (Thursday evening, mostly by hand)**
Confirm `PROMPTS.jsonl` grows. Confirm `python3` resolves. Extend `CLAUDE.md` with
project conventions — keep it short, it is re-sent every turn. Get `docker compose up`
working with an empty Next skeleton + SQLite. Open `DECISIONS.md`. Then one agent task:
all of `lib/schema/` from `01-schemas.md`. Everything else derives from it.

**Phase 1 — core chat (Friday, two windows)**
Window 1: DB schema, API routes, streaming chat, message persistence.
Window 2: conversation list, new / open / delete. Context trimming goes in now, not
later. End state: usable as a plain chatbot.

**Phase 2 — tools + trip plan (Friday window 3, Saturday window 1)**
The three external tools with Zod validation and caching. Then `update_trip_plan`, the
`applyOps` reducer, the plan panel, per-item manual editing, plan injected back into
context. The plan work is the single largest piece — give it a full window.

**Phase 3 — memory, settings, privacy (Saturday window 2)**
`remember` + profile page (view + delete). Settings page with the split prompt.
Untrusted-data wrapping. The three tests.

**Freeze Saturday 18:00.** No new features after that.

**Phase 4 — verification and README (Saturday evening, no agent)**
Clean-machine test first: clone into a new directory, `cp .env.example .env`, fill the
key, `docker compose up`, follow the README literally as a stranger would. Then write the
README. Zip including `.git`, named `ime_prezime_intervju.zip`. Target 22:00, leaving an
hour of buffer.

---

## 4. Cut list

Drop in this order if time runs short:

1. Version history for the plan and the system prompt
2. A `recall(query)` tool over past conversations — the profile alone suffices
3. Profile *editing* — keep view + delete
4. Drag-and-drop plan reordering
5. Tool-call chips in the message stream
6. Tests beyond the three in §2

**Never cut:** one-command run, the README, the committed `PROMPTS.jsonl`, the plan
artifact, cross-conversation continuity, at least two live tools, the system prompt page.
Each is an explicit requirement.

---

## 5. Working conventions

- Small, scoped commits — one per buildable unit (`feat: trip plan ops + reducer`). Do
  not rebase or squash at the end; a history that looks like one sitting reads badly.
- Log every ambiguity in `DECISIONS.md` as it appears, one line. README §3 and §4 get
  written from it, not reconstructed on Saturday.
- Reading a plan or profile from the DB always uses `safeParse`, never `parse`. On
  failure fall back to `emptyPlan()` and log — one corrupt row must not take down a
  conversation.
- Leaner is better. "Quality and leanness of the code" is an explicit evaluation
  criterion, so an unbuilt feature explained in the README beats a built one nobody
  asked for.

---

## 6. Agent usage constraints

The assigned Claude Code account is on a limited tier and cannot be swapped. Budget is
the binding constraint, so:

- **Sonnet for everything.** Not Opus. Not Haiku — a cheap model that needs three
  correction rounds costs more than one that gets it right, because every round re-sends
  the whole context.
- **Ultracode / extended thinking off** unless genuinely choosing between designs.
- **No subagents, no background workflows.** One such workflow already consumed a full
  window.
- **`/clear` after every task**, not just every phase. Context is re-sent each turn.
- **Never "look at the codebase".** Reference exact paths: `@lib/schema/plan.ts`,
  `@docs/spec/01-schemas.md`. Load only the spec section needed.
- **One task per prompt, with the stop condition stated.** Append to every prompt:
  `Work in this session only. No subagents, no background workflows. One task, then stop.`

**Do by hand, not with the agent:** Docker and compose, env and config, Tailwind setup,
git, the README, small UI tweaks, and all testing. Spend the budget where the agent has
leverage — schemas, the reducer, API routes, tool handlers, React components built from
an exact spec.

**Have an offline backlog ready** for when the limit hits: styling, manual flow testing,
`DECISIONS.md`, README sections 3, 4 and 6, `.env.example`. A five-hour window without
the agent is a full working block if there is something to fill it with.

---

## 7. README — the deliverable

Seven sections required by the brief. §1 setup and §2 architecture are mechanical. The
ones actually assessed:

**§3 Key decisions** — plan hangs off the trip, not the conversation; ops rather than
overwrite; a structured profile rather than RAG; SQLite rather than Postgres; keyless
external APIs; the split system prompt. Each with the alternative considered and why it
lost.

**§4 Ambiguities** — "immediately" versus persona coherence; who "the traveler" is
without auth; one trip or many; plan per conversation or per trip; how much history
reaches the model.

**§5 AI usage** — concrete techniques, not "I used Claude Code": the architecture was
planned up front in `docs/spec/` (committed, so the timestamps show it); the agent was
used for implementation from that spec; §6 above describes how the budget constraint
shaped the workflow, and what was done by hand as a result. Being straightforward about
the constraint reads better than pretending it did not exist.

**§6 Known limitations** — write this honestly and at length. No auth (a cookie is not
authentication), no encryption at rest, prompt injection mitigated rather than solved,
summarisation loses nuance, the tool cache can serve stale data, no rate limiting, single
SQLite file with no backup, `locked` prevents overwrites but there is no real merge UI.
The trap is writing "everything works".
