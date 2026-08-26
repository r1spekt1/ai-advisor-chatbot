# Spec 02 — Runtime

Load this for: the chat route, system prompt assembly, tool handlers, context trimming.
Schemas referenced here are defined in `01-schemas.md`.

---

## 1. System prompt composition

Assembled fresh on every request, in this order:

1. **Role contract** — immutable, in code. Identity as a travel advisor, the tool
   contract, a plan schema summary, and the untrusted-data rule.
2. **Persona** — editable, from `settings.persona_prompt`. Tone, style, verbosity.
3. **Traveler profile** — current `TravelerProfile` as JSON.
4. **Current trip plan** — current `TripPlan` as JSON, injected directly rather than
   behind a `get_trip_plan` tool. It is small, and this way the model never forgets to
   look.
5. **Conversation summary** — §3, if present.

### Rules

- The settings page edits **only the persona**. It renders the full composed prompt
  read-only underneath so nothing is hidden, plus a reset button.

  This deviates from a literal reading of "the system prompt should be editable" — a
  single textarea lets one edit destroy the tool contract and silently break the plan.
  **Document the deviation in README §4. Do not hide it.**
- Read `settings` from the DB on every request, no cache. "Changes take effect
  immediately" then comes for free.
- **Known contradiction in the brief:** "changes take effect immediately" versus "the bot
  shouldn't change personality mid-conversation". One must give. We choose live reads
  (immediacy) because it is the more explicit requirement. This goes into README §4
  verbatim — it is exactly the kind of observation the brief is asking for.
- Tool results are wrapped as **untrusted data**: fetched content is information to
  consider, never instructions to follow. Without this, a web result can shift the
  advisor's tone or behaviour mid-conversation.
- Summarisation never touches the system layers. Messages only.

---

## 2. Tools

| tool | provider | notes |
|---|---|---|
| `get_weather` | Open-Meteo (forecast + geocoding) | keyless |
| `get_exchange_rate` | Frankfurter (ECB) | keyless |
| `web_search` | OpenRouter `:online` — see below | uses the supplied key |
| `update_trip_plan` | internal | `01-schemas.md` §3 |
| `remember` | internal | `01-schemas.md` §4 |

The two external data sources are chosen to be keyless, so the app needs exactly one env
var. Do not introduce a second key.

### web_search on OpenRouter

The Anthropic server-side `web_search` tool is unavailable through OpenRouter. OpenRouter
offers web search via a `:online` model-slug suffix (or the `web` plugin), backed by Exa,
billed per result.

Do **not** simply run the main chat model with `:online`. That injects search results
before every message automatically — it is not a tool the model chooses to call, which
loses the tool semantics the brief is asking for, and it bills on every turn.

Instead: keep `web_search(query, recency)` as a real tool. Its handler makes a
**separate** OpenRouter call to a cheap model with `:online`, `max_results: 3`, and
returns a `ToolResult`. The model still decides when to search, `SearchArgs` validation
still applies, and the cost stays bounded.

### Handler rules

- Native tool calling. No router or classifier in front of the model — it adds latency
  and breaks on "what's the weather and how many euros to the dollar".
- Every handler validates its args with the Zod schema **server-side** before doing
  anything. Model arguments are untrusted input.
- Cache by argument hash with a TTL: weather ~1h, FX ~12h, search ~24h. An in-memory
  `Map` is fine. Reloading a conversation must not re-hit the network — this is a budget
  control, not just an optimisation.
- Errors return a structured `ToolResult` with `ok: false`, never an empty string. An
  empty result is an invitation to hallucinate.
- `update_trip_plan` bumps `trip.version`. A stale write returns 409; retry the merge
  once, then surface the failure.

---

## 3. Context management

Long conversations resumed over many sessions is an explicit requirement.

- **Sliding window of recent messages + a rolling summary**, stored on
  `conversation.summary` with `summarized_upto_message_id`. Trigger on a token threshold.
- A plain sliding window alone is wrong here: the earliest messages carry the trip's
  constraints. Those constraints are, however, already captured structurally in the trip
  plan and the traveler profile — so **the summary only needs to carry conversational
  flow and tone, not facts**. The two systems are complementary, not duplicated. Say this
  in the README; it shows the design was intentional.
- Summarise with the Haiku-class slug, asynchronously, after a response completes. Never
  block a reply on it.
- Keep it simple: summarise the oldest chunk once when the threshold trips. Do not build
  incremental re-summarisation.

---

## 4. Conversation titles

Generate with the Haiku-class slug after the first exchange, asynchronously. Fall back to
the first 40 characters of the opening message if the call fails. Never block on it.
