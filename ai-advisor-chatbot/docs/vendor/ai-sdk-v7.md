# AI SDK v7 — API notes

Distilled from the official v6→v7 migration guide for the parts this project uses.
**This project targets `ai@7`. Anything written in v5/v6 style is wrong here.**

Load this file whenever writing or editing code that imports from `ai` or `@ai-sdk/react`.

---

## Environment

- Node.js **22+** required. This project runs Node 26.
- All AI SDK packages are **ESM-only**. `require()` does not work.

---

## 1. `system` is now `instructions`

The single most common v5/v6 mistake. Applies to `generateText`, `streamText`,
`generateObject`, `streamObject`, and `prepareStep` return values.

```ts
// WRONG (v6)
streamText({ model, system: composedPrompt, messages });

// RIGHT (v7)
streamText({ model, instructions: composedPrompt, messages });
```

`system` still works as a deprecated fallback, but do not write it. When both are given,
`instructions` wins.

### System messages inside `messages` are rejected by default

v7 refuses `{ role: 'system' }` entries in `prompt`/`messages`. Put system instructions
in the top-level `instructions` option.

There is an `allowSystemInMessages: true` escape hatch — **do not use it here.** The
guide warns it lets a user-submitted message override the system prompt. Our persisted
messages are user/assistant only, so this never comes up.

---

## 2. Lifecycle callbacks renamed

| v6 | v7 |
|---|---|
| `onFinish` | `onEnd` |
| `onStepFinish` | `onStepEnd` |
| `experimental_onStart` | `onStart` |
| `experimental_onStepStart` | `onStepStart` |
| `experimental_onToolCallStart` | `onToolExecutionStart` |
| `experimental_onToolCallFinish` | `onToolExecutionEnd` |

`onEnd` is where message persistence happens in this project. Old names still work as
deprecated aliases; write the new ones.

---

## 3. Stream response helpers moved off the result object

**This is the biggest structural change for the chat route.** The methods on the
`streamText` result are deprecated in favour of stateless top-level helpers.

```ts
// WRONG (v6)
const result = streamText({ model, instructions, messages });
return result.toUIMessageStreamResponse({ originalMessages });

// RIGHT (v7)
import { streamText, toUIMessageStream, createUIMessageStreamResponse } from 'ai';

const result = streamText({ model, instructions, messages });

const uiStream = toUIMessageStream({
  stream: result.stream,        // note: result.stream, not result.fullStream
  originalMessages,
  generateMessageId,
  onFinish,                     // this helper's own option, still named onFinish
});

return createUIMessageStreamResponse({ stream: uiStream });
```

Note the asymmetry: `streamText` takes `onEnd`, but `toUIMessageStream` takes `onFinish`.
They are different APIs.

Other renamed pairs, same pattern:
- `result.toTextStreamResponse()` → `createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) })`
- `result.pipeUIMessageStreamToResponse(res, …)` → `pipeUIMessageStreamToResponse({ stream: uiStream, response })`

---

## 4. `fullStream` → `stream`

```ts
for await (const part of result.stream) { … }
```

`fullStream` remains as a deprecated alias. Use `stream`.

`onChunk` now fires for **every** stream part, not the old subset — it can receive
`start`, `start-step`, `text-start`, `text-end`, `finish-step`, `finish`, `abort`,
`error`, and more. Always guard on `chunk.type` before reading fields.

---

## 5. Tool loop: `stepCountIs` → `isStepCount`

```ts
import { isStepCount } from 'ai';

streamText({ model, instructions, messages, tools, stopWhen: isStepCount(5) });
```

Also renamed: `experimental_activeTools` → `activeTools`.

---

## 6. Tool definitions and context

`tool()` and `inputSchema` are unchanged — Zod schemas work as before.

What changed is context. `experimental_context` is now `context`, and per-tool values are
declared with `contextSchema` and supplied through `toolsContext`, keyed by tool name.
Shared generation state moved to `runtimeContext`.

```ts
const getWeather = tool({
  inputSchema: WeatherArgs,
  contextSchema: z.object({ requestId: z.string() }),
  execute: async ({ city, days }, { context: { requestId } }) => { … },
});

streamText({
  model,
  tools: { getWeather },
  runtimeContext: { travelerId },              // visible in prepareStep, events, steps
  toolsContext: { getWeather: { requestId } }, // per-tool, typed from contextSchema
});
```

Two gotchas: if **any** tool declares `contextSchema`, `toolsContext` becomes required;
and a tool callback reading a field not in its own `contextSchema` is a type error.

**For this project, prefer closures over tool context.** Our handlers need the traveler
id and the trip id — build the tool objects inside the request handler and close over
those values. That sidesteps the whole `contextSchema` / `toolsContext` surface. Only
reach for tool context if a real need appears.

Also renamed: type `ToolCallOptions` → `ToolExecutionOptions`.

---

## 7. Result shape: everything accumulates now

Top-level `content`, `toolCalls`, `toolResults`, `files`, `sources`, `warnings`, and
`usage` now cover **all steps**. In v6 they were final-step only.

For final-step-only values, use `finalStep`:

```ts
const result = streamText({ … });
const finalStep = await result.finalStep;   // must await for streamText

finalStep.toolCalls;    // final step only
await result.toolCalls; // all steps
```

`result.totalUsage` is deprecated — `result.usage` now means the same thing.

`step.response.messages` no longer accumulates across steps. For the full response
history use `result.responseMessages`.

---

## 8. UI side

- `isToolOrDynamicToolUIPart` removed → use `isToolUIPart`. Needed when rendering
  tool-call chips from persisted `message.parts`.
- Message content parts: `{ type: 'image', image }` is deprecated →
  `{ type: 'file', mediaType: 'image', data }`. Not used in this project.
- A new `reasoning-file` part type exists. Any exhaustive `switch` over part types must
  have a default branch so it does not break on unknown parts.

---

## 9. Not used in this project

Listed so they are not accidentally introduced: `@ai-sdk/otel` telemetry,
`toolApproval` / `needsApproval`, `WorkflowAgent`, `ToolLoopAgent`, MCP transports,
`include.rawChunks`.

Plain `streamText` with `tools` and `stopWhen` is the right level for this app.

---

## 10. When something here is unclear

Check `https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0` and the v7 docs for
`streamText`, chatbot message persistence, and tool calling. Do not guess from v5
memory — the renames above are the ones that silently compile-fail or, worse, run with
deprecated behaviour.
