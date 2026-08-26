# AI Travel Advisor

A chat application where a traveler plans a real trip with an AI advisor. Alongside the
conversation, a **trip plan** takes shape as a structured artifact the traveler can see,
return to, and edit by hand. The advisor fetches live data instead of guessing, remembers
the traveler across separate conversations, and its instructions are editable from a
settings page.

---

## 1. Setup & run

**Prerequisites:** Docker (with Compose). Nothing else — no Node, no database.

```bash
cp .env.example .env
# open .env and paste the OpenRouter key into OPENROUTER_API_KEY
docker compose up --build
```

Then open **http://localhost:3000**.

The first build takes a few minutes: `better-sqlite3` is a native module and is compiled
inside the image. Migrations run automatically when the container starts, so there is no
setup step beyond the above. Data lives in a named Docker volume and survives
`docker compose down`; `docker compose down -v` resets it.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | The key supplied by Infinum. Despite the wording in the email this is an **OpenRouter** key (`sk-or-v1-` prefix), not an OpenAI one. |
| `CHAT_MODEL` | no | Defaults to `anthropic/claude-haiku-4.5`. See §3. |
| `DATABASE_PATH` | no | Overridden to `/app/data/app.db` by Compose. |
| `CONTEXT_TOKEN_THRESHOLD` | no | Defaults to 8000. See below. |

Blank values are treated as absent, so copying `.env.example` verbatim and filling in only
the key gives you every default.

### Seeing the long-conversation behaviour

Context trimming only triggers on genuinely long conversations, which makes it awkward to
observe. To watch it work, set `CONTEXT_TOKEN_THRESHOLD=500` in `.env`, restart, and send
five or six messages in one conversation. Older messages are then folded into a rolling
summary:

```bash
sqlite3 data/app.db "select summary from conversation where summary != '';"
```

### Running without Docker

```bash
npm install
cp .env.example .env      # add the key
npm run db:migrate
npm run dev
```

Requires Node 22+ (developed on 26). Useful scripts:

```bash
npm test              # targeted unit tests
npm run tools:check   # calls the three external tool handlers directly
npm run smoke         # one minimal LLM call, verifies the provider wiring
```

---

## 2. Architecture overview

One Next.js process serves both the UI and the API. There is no separate backend and no
second service.

```
Browser — chat · plan panel · /settings · /profile
   │
   ├── POST /api/chat ──────────► streamText (AI SDK v7) ──► OpenRouter
   │      ├─ composeSystemPrompt: role contract + persona + profile + plan + summary
   │      ├─ tools: getWeather · getExchangeRate · webSearch · updateTripPlan · remember
   │      └─ persists the complete UIMessage parts array
   │
   ├── /api/conversations · /api/plan · /api/profile · /api/settings
   │
   └── SQLite via Drizzle — traveler · trip · conversation · message · settings
```

### Data model

```
traveler  ──  profile (json)
   │
   ├──1:1──  trip  ──  plan (json) + version
   │
   └──1:N──  conversation  ──(nullable)──►  trip
                   │
                   └──1:N──  message  ──  parts (json)
```

The important edge is that **`plan` hangs off `trip`, not off `conversation`** — see §3.

### Stack

- **Next.js 16** (App Router, Turbopack) — one process, UI and API
- **Vercel AI SDK v7** with `@openrouter/ai-sdk-provider`
- **SQLite** (`better-sqlite3`) + **Drizzle ORM**, migrations run on container boot
- **Zod 4** — one source of truth for tool schemas, API validation and TypeScript types
- **Tailwind 4**, `streamdown` for markdown rendering, `lucide-react` for icons
- **Vitest** for targeted unit tests

### Zod as the single source of truth

`lib/schema/` defines the trip plan, the plan operations, the traveler profile and the
tool arguments. The same schemas become the JSON Schema the model sees for tool calls,
validate every API request, and generate every TypeScript type via `z.infer`. No type in
the application is written twice.

### Three layers of memory, deliberately separated

| Layer | Holds | Lifetime |
|---|---|---|
| **Trip plan** | Decisions: destinations, dates, party, budget, day-by-day items | The trip |
| **Traveler profile** | Durable preferences: home city, interests, pace, budget band | Across all conversations |
| **Conversation summary** | Flow and tone: what the traveler reacted well or badly to | One conversation |

They do not overlap, and the summarisation prompt says so explicitly, so it does not
re-state trip facts that are already injected from the plan and the profile.

---

## 3. Key decisions

**The plan belongs to the trip, not the conversation.** The brief says a traveler plans
*one trip across several conversations*, so many conversations point at one trip and
`conversation.trip_id` is nullable — a conversation often starts before a trip exists
("somewhere warm in October"), and the trip is created lazily on the first
`updateTripPlan` call. The alternative, a plan per conversation, would mean the traveler
loses their itinerary the moment they start a new chat. This decision propagates through
everything else.

**Plan edits are typed operations, not a merge-patch.** `updateTripPlan` takes a list of
ops (`upsert_item`, `remove_day`, `set_dates`, …) rather than a partial plan object. RFC
7396 merge-patch works for scalars but cannot address a single array element, so it
replaces the whole `days` array — which would silently wipe items the traveler had edited
by hand. Ops are more verbose and are the only shape that expresses "touch only this".

**The UI dispatches the same ops as the model.** `applyOps(plan, ops)` is one pure
function with no I/O. Manual edits in the panel and tool calls from the model both go
through it, so there is a single write path and one place to test.

**`locked` protects manual edits.** Any item the traveler edits by hand is marked
`locked`. Ops targeting a locked item are refused and returned in a `rejected` array,
passed back to the model so it can tell the traveler what it could not change.
`trip.version` gives optimistic locking for *simultaneous* conflicts; `locked` covers the
*deferred* one — the traveler edits a hotel, and two days later the model regenerates that
day. Without it, "they can adjust individual parts of it" does not actually hold.

**Liberal in what the tool accepts, strict in what gets stored.** The tool-facing schema
is deliberately more permissive than the stored one. This was learned twice in testing:
first a `rationale` seven characters over its limit, then an operation array two items
over its cap — each made the SDK reject an entire plan update before the handler ever ran,
and the stream errored out. Any Zod constraint on a tool input is a way for the model to
lose a whole turn's work. The tool schema now carries generous maximums with the intended
length in the field description, and `applyOps` truncates every string on write so the
stored `TripPlan` stays tight.

**A structured profile rather than RAG over past messages.** Cross-conversation continuity
is a fixed set of fields the model writes with a `remember` tool, injected into every
prompt. Vector search over old messages was the obvious alternative and was rejected: it
puts raw personal data into embeddings, retrieval is non-deterministic, and at this scale
fifteen structured fields are more precise. It is also inspectable and deletable by the
traveler, which an embedding index is not.

**The profile schema *is* the privacy denylist.** There is no field for a passport number,
and the schema is `.strict()`, so unknown keys are rejected. Even if the traveler dictates
one and the model tries to store it, `RememberArgs.parse()` throws and nothing lands. A
structural guarantee rather than a behavioural one — a regex filter catches what you
thought of; the schema catches what you did not. Verifiable:

```bash
sqlite3 data/app.db "select profile from traveler;" | grep -c "123456789"   # 0
```

**Outbound tool arguments are validated before any network call.** `SearchArgs` rejects
long digit runs and email addresses, so personal data cannot leave the process inside a
web search. The rejection takes 1–2 ms, before the request is made — which is the
difference between a privacy control and a privacy claim.

**Tool results reach the model wrapped as untrusted data**, with an explicit note that
fetched content is information to weigh and never instructions to follow. AI SDK v7 also
rejects `role: "system"` messages inside `messages` by default, closing the same class of
injection at the SDK level; `allowSystemInMessages` is deliberately not enabled.

**SQLite rather than Postgres.** One service instead of two: no healthcheck, no
`depends_on` ordering, no connection pool, and migration-on-boot is trivial. For a
single-user application a one-service Compose file is a *better* answer to "must run with
one command on a clean machine", not a compromise.

**Keyless external APIs — exactly one required environment variable.** Open-Meteo for
weather and Frankfurter for exchange rates need no credentials. The selection criterion
was the number of values a reviewer has to fill in, not data quality.

**`webSearch` is a real tool that wraps a separate `:online` call.** The Anthropic
server-side web search tool is unavailable through OpenRouter. OpenRouter's `:online`
suffix could have been applied to the main chat model, but that injects search results
before *every* message automatically — it stops being a tool the model chooses to call,
and it bills on every turn. Instead the handler makes its own `:online` request to a cheap
model with `max_results: 3`, so tool semantics, argument validation and cost all stay
intact.

**The settings page edits the persona, not the whole prompt.** The composed prompt is
rendered read-only underneath so nothing is hidden. See §4 — a deliberate departure from a
literal reading of the brief.

**The default model is the cheaper one, on purpose.** The supplied key has a hard $5 cap
and reviewers run the application on that same key — a finished app on an exhausted key
cannot be evaluated. Both models were tried on the final build with no material difference
in advice quality, and Haiku is noticeably faster, so `anthropic/claude-haiku-4.5` is the
committed default. It is also the model every prompt here was tuned against. `CHAT_MODEL`
switches to Sonnet 5.

**Blank environment values are treated as absent.** `??` only fires on `undefined`, but
Compose passes an empty `.env` entry through as `""`. A small `lib/env.ts` normalises this
everywhere. See §5 for why this mattered.

**Presentation was the last thing built, after everything else was verified.** The visual
pass touches only components under `app/` and `globals.css` — no file under `lib/` or
`app/api/`. The palette deliberately avoids the warm-cream-and-terracotta scheme that has
become the recognisable signature of AI-generated interfaces; the accent is a muted pine
green, used only on active state, primary actions and focus rings.

---

## 4. Ambiguities

**"Changes take effect immediately" versus "the bot shouldn't change personality
mid-conversation."** These pull against each other: if the persona is edited while a
conversation is open, one of the two must give. I chose live reads — settings are read
from the database on every request, with no cache — because immediacy is the more explicit
requirement. The cost is that an existing conversation does shift tone after an edit. The
alternative was snapshotting the prompt per conversation, which preserves coherence but
makes "immediately" false.

**"The system prompt should be viewable and editable."** Read literally, that means one
textarea holding the entire prompt. But the prompt also carries the tool contract and the
plan schema, and a single careless edit would silently break the trip plan while the chat
kept working. I split it: an immutable **role contract** in code, and an editable
**persona**. The settings page shows the full composed prompt read-only beneath the
editor, so nothing is concealed — the traveler can see exactly what the model receives,
they just cannot delete the parts that make the app function.

**Who is "the traveler" when there is no login?** Continuity across conversations needs an
identity. I set an `httpOnly`, `sameSite=lax` cookie holding a UUID on first request. This
is explicitly **not authentication**: losing the cookie loses the data, and anyone holding
the cookie sees everything. It was chosen over a single hardcoded traveler so that a
reviewer starts with a clean session and so that "delete my data" means something.

**One trip or many?** The schema permits many trips per traveler; the application creates
and links one. The brief's own wording — "a traveler usually plans a *single* trip across
several conversations" — supports the simpler reading, and a trip switcher would have been
UI work with no bearing on any requirement.

**How much history should reach the model?** A plain sliding window is wrong here, because
the earliest messages carry the trip's constraints. But those constraints are already
captured structurally in the plan and the profile — so the rolling summary only needs to
carry conversational flow and tone. That split is deliberate and is stated in the
summarisation prompt.

**Allergies.** `TravelerProfile` has a `dietary` field, and "vegetarian" is stored there.
A shellfish allergy is arguably the same kind of fact and is *more* important to remember.
I decided not to persist allergies: they are medical information, a special category, and
the advisor uses them within the conversation instead. The result is a real inconsistency
from the traveler's point of view, noted in §6. The `remember` tool description states the
rule explicitly, so the behaviour is a decision rather than a coin-flip on how the model
interprets "health information".

**"Delete conversations they no longer need."** Hard delete, cascading to messages. No
`deleted_at`. Consistent with the privacy posture and easier to defend than soft delete
that quietly keeps everything.

---

## 5. AI usage

Claude Code was used throughout, on the assigned account. `PROMPTS.jsonl` is the complete
log.

**Architecture was planned before implementation.** `docs/spec/` holds a four-part build
spec — core and data model, schemas, runtime, delivery — written and committed before any
feature code. Every prompt referenced a specific section rather than asking the agent to
work out the design. The commit timestamps show the spec preceded the code. The largest
single win came from writing all of `lib/schema/` first: the tool definitions, the API
validation and every TypeScript type derive from it, so a precise schema file removed most
of the ambiguity from every later prompt.

**Vendor documentation was pinned.** The project uses AI SDK **v7**, which renames
`system` → `instructions`, `onFinish` → `onEnd`, `stepCountIs` → `isStepCount`, and moves
the stream response helpers off the result object. Agents write v5-era code for this SDK
confidently and it fails in non-obvious ways. `docs/vendor/ai-sdk-v7.md` distils the
relevant deltas and was referenced in every prompt touching the chat route — probably the
single highest-leverage thing I did.

**One task per prompt, with an explicit stop condition.** Every prompt ended with
`Work in this session only. No subagents, no background workflows. One task, then stop.`
This was learned the hard way: my first prompt asked for an adversarial spec critique plus
three deliverables, and it fanned out into a twelve-agent workflow that burned 2.5M tokens
and an entire usage window in nine minutes without finishing. Constraining scope per prompt
and clearing context between tasks made the rest of the build cheap and predictable.

**Verification before belief.** Each step had a specific check — a shell command, a SQL
query, a behavioural test in the chat — defined in the spec alongside the task. "It's done"
from the agent was never sufficient. This caught real defects: tool parts not persisting,
relative dates resolving to 2024, and the model encoding activities in day labels instead
of creating items. It also caught one of my own diagnostic commands being wrong, which had
sent me chasing a bug that did not exist.

**The clean-machine test earned its place.** Three defects surfaced in a fresh clone that
never appeared in development. A module-level database connection and a module-level
API-key assertion both broke `next build` inside the container, where neither the volume
nor the runtime environment exists yet — both now initialise lazily. And blank values in
`.env.example` silently defeated the `??` fallbacks, so a reviewer copying it verbatim
would have got an empty model slug and a summarisation threshold of zero. The first two
failed loudly at build time; the third would have produced an app that builds, starts, and
fails on the first message. All three would have reached the reviewer.

**Deliberate division of labour.** The agent wrote schemas, the reducer, API routes, tool
handlers and React components from an exact spec. I wrote the Docker setup, Compose,
environment configuration, git history, this README, and did all the testing by hand.
Iterating on a Dockerfile with an agent that cannot run `docker compose up` is the most
expensive way to solve an hour of work.

**Model and effort discipline.** Sonnet for everything, with reasoning effort scaled to the
task — low for mechanical work from spec, medium for the chat route, the plan panel and the
visual pass where there is real state or real judgement. Opus was not used after the first
session. On a constrained quota, the number of iterations you get matters more than the
quality of any single one.

---

## 6. Known limitations

**Security and privacy**

- **No authentication.** A cookie is not an identity check. Anyone with the cookie value
  has full access to that traveler's data.
- **No encryption at rest.** The SQLite file is plaintext on the volume.
- **Prompt injection is mitigated, not solved.** Tool results are wrapped as untrusted data
  and the SDK rejects system messages in the history, but a determined injection in fetched
  web content could still influence a response.
- **The outbound redaction is a heuristic.** It catches long digit runs and email
  addresses. A passport number written as `AB 123 456` would pass it. The profile schema is
  the real guarantee; the redaction is a second layer.

**Correctness and durability**

- **A rejected tool input still loses that turn's work.** Any Zod constraint on a tool
  input can abort an entire call before the handler runs — this bit twice during testing,
  once on an over-length rationale and once on an operation array two items over its cap.
  The tool-facing limits are now deliberately generous and `applyOps` truncates on write,
  but the correct fix is a repair loop that feeds the validation error back to the model
  for a second attempt rather than discarding the call. Not implemented.
- **The tool cache is in-memory** and is lost on restart. Weather and FX are keyless so
  this is harmless, but `webSearch` spends the shared key and should be persisted for real
  use. Known and consciously skipped for the deadline.
- **Single SQLite file, no backups, no concurrent-writer story.** Fine for one user; not a
  production posture.
- **No rate limiting** on any route, and no guard against a runaway tool loop beyond
  `isStepCount(5)`.
- **Summarisation loses nuance.** Once messages are folded into the rolling summary the
  detail is gone. Facts survive because they live in the plan and the profile, but a
  specific phrasing the traveler used may not.
- **`locked` prevents overwrites but there is no merge UI.** When the advisor's proposal
  conflicts with a locked item it is refused and reported. The traveler cannot review the
  two versions side by side and choose.
- **The model's prose can drift from the plan state.** In one test it correctly refused to
  remove a locked item, said so, and then summarised the day in prose without mentioning
  that item. The panel is the source of truth; the narration is not always consistent
  with it.
- **The advisor's day counting is loose** — asked for "3 days in Lisbon" it produced four
  day containers, including a departure day. Defensible, but not what was asked.

**Behaviour worth knowing about**

- **Instructions are not a substitute for tools.** Before the tools were wired up, the
  model would invent tool-call syntax *and* invent the result — a fabricated temperature —
  despite an explicit "never state a figure you have not fetched" in the system prompt. The
  hallucination stopped only when real tools existed. Worth remembering when reasoning
  about what a prompt can and cannot enforce.
- **Allergies are not remembered while dietary preferences are.** Inconsistent from the
  traveler's perspective; the reasoning is in §4.
- **Quality depends on the model.** The committed default is Haiku 4.5. Sonnet 5 is
  available via `CHAT_MODEL` and is somewhat more decisive, though testing showed no
  material difference in advice quality for this application.
- **The first message of a new trip is the slowest.** It produces the largest tool call of
  the conversation — every day and item at once — and also pays for the lazy database and
  provider initialisation. Later edits are incremental and noticeably quicker.

**Scope**

- No drag-and-drop reordering of plan days or items.
- Profile fields can be viewed and deleted but not edited directly.
- No plan or prompt version history.
- The conversation list is unpaginated.
- The test suite is small and deliberate — locked-item protection, the schema denylist,
  outbound redaction, and write-time truncation — chosen for the logic worth defending
  rather than for coverage.

---

## 7. Beyond the spec

- **`openQuestions` on the plan** — the advisor keeps a list of decisions still missing,
  which the panel surfaces and which pushes it to drive the conversation instead of waiting
  to be asked.
- **`locked` items** — the mechanism that makes manual editing actually safe, described
  in §3.
- **A privacy layer**: schema-as-denylist for stored memory, outbound argument validation
  before any network call, and untrusted-data wrapping of tool results. The brief flagged
  that personal information moves around as the advisor gets more capable; this is the
  answer to that.
- **Tool activity is visible while it happens.** A tool call emits no text at all, so
  without this the interface sits empty for the length of the call and looks stuck. Each
  in-flight tool renders a quiet labelled row — "Checking the weather", "Updating your
  plan" — which is what makes the advisor feel responsive rather than frozen.
- **`CONTEXT_TOKEN_THRESHOLD` exposed as an environment variable** so that trimming, which
  is otherwise invisible without a very long conversation, can be observed in a couple of
  minutes.
- **Verification scripts** — `npm run smoke` proves the provider wiring with one minimal
  call, and `npm run tools:check` exercises the three external handlers directly, including
  the negative cases, without spending anything on chat.
- **A designed interface rather than a scaffold** — a warm editorial theme with a
  restrained palette, a serif display face and consistent iconography. Built last, as a
  presentation-only pass, so it could not affect anything already verified.
- **The build spec is committed** in `docs/spec/`, along with `DECISIONS.md`, a running log
  of every judgement call made while building. Sections 3 and 4 above were written from it
  rather than reconstructed afterwards.
