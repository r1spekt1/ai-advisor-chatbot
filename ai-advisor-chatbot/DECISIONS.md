# Decisions log

A running log of judgement calls made while building, written as they came up rather than
reconstructed at the end. README sections 3 and 4 are drawn from this.

## Stack and infrastructure

- **Provider is OpenRouter, not OpenAI.** The key supplied in the email has an
  `sk-or-v1-` prefix. OpenRouter is OpenAI-API-compatible, so only the base URL and the
  model slug format change.
- **SQLite instead of Postgres.** One service instead of two: no healthcheck, no
  `depends_on` ordering, no connection pool. A single-service Compose file is a better
  answer to "one command on a clean machine" than a two-service one.
- **Model slugs confirmed against the live API** rather than written from memory, and kept
  in one `lib/models.ts` constant so a change is a one-line edit.
- **Next 16.3 with Turbopack** — the scaffold default. The spec was written against 15;
  `serverExternalPackages` behaves the same.
- **`output: "standalone"` dropped.** Standalone tracing plus a native module
  (`better-sqlite3`) is a known source of Docker failures. Image size is not being
  evaluated; whether it starts is.
- **`allowScripts` allowlist committed to `package.json`.** npm 12 disables install
  scripts by default, which would have hard-failed the native module build inside the
  container.
- **AI SDK v7 is ESM-only.** Standalone `tsx` scripts that import it must be `.mts`.
  `scripts/migrate.ts` stays `.ts` because it does not import `ai`.
- **Millisecond timestamps.** `mode: "timestamp"` stores seconds, and messages written in
  the same second could load in the wrong order. Switched to `timestamp_ms` before the
  conversation list was built.

## Budget

- **The key has a hard $5 cap.** `CHAT_MODEL` is configurable so the model is one env var
  away from being changed.
- **Tool result caching is a budget control, not an optimisation.** Weather and FX are
  keyless, but `webSearch` spends the shared key on every call.
- **Target: leave roughly $2 unspent** so reviewers can actually run the application. A
  finished app on an exhausted key cannot be evaluated.
- **Committed default flipped from Sonnet to Haiku** after testing both on the final clean
  build. No material difference in advice quality, Haiku is noticeably faster, reviewers
  spend the same $5 key, and every prompt in the project was tuned against Haiku. Sonnet
  is one env var away.

## Data model

- **The plan hangs off the trip, not the conversation.** The brief says a traveler plans
  one trip across several conversations. This is the decision everything else depends on.
- **`conversation.trip_id` is nullable** and the trip is created lazily on the first
  `updateTripPlan` call. Conversations often start before a trip exists.
- **One active trip per traveler.** The schema allows many; the app creates one. No trip
  switcher — the brief's own wording ("a *single* trip") supports the simpler reading.
- **`message.parts` stores the complete parts array**, tool calls and results included.
  Storing only text would hand the model a different history than it produced on reload.
- **Hard delete for conversations**, cascading to messages. No `deleted_at`.
- **Traveler identity is an `httpOnly` cookie holding a UUID.** Not authentication —
  stated as such in the README. Chosen over a hardcoded traveler so reviewers get a clean
  session and so "delete my data" is meaningful.

## Trip plan

- **Typed operations rather than merge-patch.** Merge-patch cannot address one array
  element, so it replaces the whole `days` array and wipes manual edits.
- **The UI dispatches the same ops as the model.** One pure `applyOps` reducer, one write
  path, one thing to test.
- **`locked` on manually edited items.** `version` catches simultaneous conflicts;
  `locked` catches deferred ones. Rejected ops are returned to the model so it can tell
  the traveler what it could not change.
- **Reordering ops dropped** (`reorder_days`, `move_item`) — they need drag-and-drop,
  which was on the cut list.
- **`openQuestions` added beyond the brief.** Cheap, gives the panel a "still to decide"
  section, and pushes the advisor to drive the conversation.
- **Tool-facing limits are deliberately looser than stored limits.** This bit twice: a
  `rationale` seven characters over `ShortText`'s 120, and later an ops array with 22
  entries against a cap of 20. Each time the SDK rejected the entire plan update before
  `execute` ran and the stream errored out — the model's whole turn of work discarded over
  a validation detail. Any Zod constraint on a tool input is a way to lose a turn. The
  tool schema now uses generous tool-only string types with the intended length in the
  field description, and `applyOps` truncates every string on write so the stored
  `TripPlan` keeps its tight limits. Liberal in what you accept, strict in what you store.
  The truncation matters more than the loosening: without it an over-long value would be
  stored, then fail `TripPlan.safeParse` on the next read and silently reset the plan to
  `emptyPlan()`.

## Prompt and tools

- **Split system prompt: immutable role contract in code, editable persona in the
  database.** A single textarea would let one edit destroy the tool contract and silently
  break the plan. The full composed prompt is shown read-only beneath the editor so
  nothing is hidden. A deliberate departure from a literal reading of the brief.
- **"Changes take effect immediately" conflicts with "the bot shouldn't change personality
  mid-conversation."** Chose live reads — immediacy is the more explicit requirement.
- **The role contract states a tool *policy*, not a tool *inventory*.** An earlier version
  listed the tools by name; the SDK already injects their definitions, and the duplicate
  list drifts. It also caused the model to emit `<get_weather>` as literal text before any
  tools existed.
- **Today's date is injected into the prompt.** Without it the model resolved "late
  October" to 2024. The same instruction says to leave `start`/`end` null and record the
  traveler's wording in `dates.note` when the window is approximate, instead of inventing
  exact dates.
- **Days are containers, items are content.** The model initially encoded activities in
  day labels ("Arrival & Mercado da Ribeira") and left `items` empty. `upsert_item` existed
  and was exposed — a comprehension problem, fixed in the prompt, not the schema.
- **`webSearch` is a real tool wrapping a separate `:online` call.** Putting `:online` on
  the main chat model would inject results before every message automatically, which
  destroys tool semantics and bills every turn.
- **Tool errors return a structured `ToolResult` with `ok: false`**, never an empty
  result. An empty result is an invitation to hallucinate.
- **`source` and `fetchedAt` on every tool result**, and the prompt instructs the advisor
  to state both. This is what "getting it right is the goal" asks for.

## Privacy

- **The profile schema is the denylist.** No field exists for a passport number and the
  schema is `.strict()`. Verified:
  `sqlite3 data/app.db "select profile from traveler;" | grep -c "123456789"` → 0.
  A regex filter catches what you thought of; the schema catches what you did not.
- **Outbound tool arguments are validated before any network call.** `SearchArgs` rejects
  long digit runs and email addresses in 1–2 ms, before the request goes out.
- **Exact budget lives in the plan, only a coarse band in the profile.** Layered
  retention: the figure is scoped to one trip and deleted with it.
- **Companions carry no names** — relation and age band only. Enough for planning without
  storing personal data about a third party who never consented.
- **Allergies are not stored, although `dietary` exists and holds "vegetarian".** Medical
  information is a special category; the advisor uses it within the conversation instead.
  Inconsistent from the traveler's perspective — flagged in README §6. The `remember` tool
  description states the rule explicitly, so this is a decision rather than a coin-flip on
  how the model reads "health information".
- **Structured profile instead of RAG over past messages.** Raw personal data in
  embeddings, non-deterministic retrieval, and worse precision than fifteen structured
  fields at this scale. Also inspectable and deletable, which an embedding index is not.

## Context and memory

- **Three layers, deliberately separated:** the plan holds decisions, the profile holds
  durable preferences, the summary holds conversational flow and tone. The summarisation
  prompt says so, to stop it duplicating trip facts.
  Verified: "don't push museums again" is a reaction rather than a fact, survived
  summarisation, and shaped a later suggestion.
- **Sliding window plus rolling summary**, not a plain window — the earliest messages carry
  the trip's constraints. Those constraints already live in the plan and the profile, so
  the summary only has to carry flow.
- **`CONTEXT_TOKEN_THRESHOLD` exposed as an environment variable** because trimming cannot
  otherwise be demonstrated without a very long conversation.
- **Summarisation runs after the response and never blocks it.** A failure is logged and
  ignored.

## Found by the clean-machine test

Three defects appeared only in a fresh clone built from scratch, and none of them in
development.

- **A module-level database connection broke `next build` in the container.**
  `lib/db/index.ts` opened SQLite at import time; `next build` imports route modules to
  collect page data, and the volume does not exist yet at that point. Now lazy behind a
  proxy, so no call site had to change.
- **A module-level API-key assertion broke it the same way.** `lib/ai/provider.ts` threw
  on a missing key at import time. Now a `getProvider()` function, called at request time.
- **Blank `.env.example` values defeated the `??` fallbacks.** Compose passes an empty
  entry through as `""`, not `undefined`, so `CHAT_MODEL` resolved to an empty string and
  `Number("")` made the summarisation threshold 0. A reviewer copying `.env.example`
  verbatim would have got an app that builds, starts, and fails on the first message.
  `lib/env.ts` now normalises blank to absent everywhere.

## Presentation

- **The visual pass was done last, after all functionality was verified**, and touches
  only components under `app/` and `globals.css`. No file under `lib/` or `app/api/` was
  modified.
- **The palette deliberately avoids warm cream with a terracotta accent.** That scheme has
  become the recognisable signature of AI-generated interfaces; the accent here is a muted
  pine green, used only on active state, primary actions and focus rings.
- **`next/font/google` adds a build-time network dependency**, so the Docker build was
  re-verified from a clean clone after the visual pass rather than assumed.
- **Tool activity is rendered inline.** A tool call emits no text, so the first message of
  a new trip — the largest call in any conversation — left the interface blank for ten to
  twenty seconds and looked frozen. Each in-flight tool now shows a quiet labelled row.
  The delay is inherent to the tool loop; what was missing was any sign of it.

## Observations from testing

- **Instructions are not a substitute for tools.** Before the tools were wired up, the
  model invented both the tool-call syntax and the result — a fabricated temperature —
  despite an explicit "never state a figure you have not fetched" in the prompt. The
  hallucination stopped only when real tools existed.
- **The model's prose can drift from the plan state.** It correctly refused to remove a
  locked item and said so, then summarised the day in prose without mentioning that item.
  The panel is the source of truth.
- **Haiku is noticeably more hesitant than Sonnet** — it asks a clarifying question where
  Sonnet acts. Visible in the prompt log, since most of the build ran on Haiku.

## Process

- **The spec was written and committed before any feature code**, split into four files so
  each prompt loads only the section it needs.
- **AI SDK v7 deltas pinned in `docs/vendor/ai-sdk-v7.md`.** Agents write v5-era code for
  this SDK confidently; `system` → `instructions` and the stream-helper changes would
  otherwise have cost several iterations.
- **One task per prompt, with an explicit stop condition.** The first prompt asked for an
  adversarial critique plus three deliverables and fanned out into a twelve-agent workflow
  that consumed 2.5M tokens and a full usage window in nine minutes without finishing.
- **Docker, Compose, environment configuration, git and the README were written by hand.**
  Iterating on a Dockerfile with an agent that cannot run `docker compose up` is the most
  expensive way to solve an hour of work.
- **Every step had a verification command defined alongside it.** "It's done" from the
  agent was never sufficient — and once, a wrong diagnostic command of my own sent me
  chasing a bug that did not exist, which is its own lesson about trusting the check.
- **Fix the class, not the case.** The tool-limit failures came one at a time and the first
  two were patched individually. The third made it obvious they were one problem, and a
  single sweep across every constraint in the ops path closed it properly. Worth noticing
  the pattern earlier than I did.
