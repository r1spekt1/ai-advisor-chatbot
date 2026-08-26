import { DEFAULT_PERSONA_PROMPT } from "@/lib/settings";

export async function GET() {
  return Response.json({ persona: DEFAULT_PERSONA_PROMPT });
}
