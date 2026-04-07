/**
 * Optional OpenAI call for Ash daily recap copy. Returns null if unavailable or on failure.
 */
export async function generateAshDailyRecapOpenAI(
  userPrompt: string,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_RECAP_MODEL?.trim() || "gpt-4o-mini",
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 220,
        temperature: 0.85,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return text;
  } catch {
    return null;
  }
}
