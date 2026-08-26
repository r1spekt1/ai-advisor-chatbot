import { z } from "zod";
import { getSettings, updatePersonaPrompt } from "@/lib/settings";
import { composeSystemPrompt } from "@/lib/prompt";

const UpdateSettingsBody = z.object({
  persona: z.string().trim().min(1).max(4000),
});

export async function GET() {
  const settings = await getSettings();
  return Response.json({
    persona: settings.personaPrompt,
    composedPrompt: composeSystemPrompt({ persona: settings.personaPrompt }),
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const parsed = UpdateSettingsBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const settings = await updatePersonaPrompt(parsed.data.persona);
  return Response.json({
    persona: settings.personaPrompt,
    composedPrompt: composeSystemPrompt({ persona: settings.personaPrompt }),
  });
}
