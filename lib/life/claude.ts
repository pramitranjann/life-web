import { getLifeServerEnv } from '@/lib/life/env'

interface ClaudeCallArgs {
  system: string;
  user: string;
  maxTokens: number;
}

export async function callClaude({ system, user, maxTokens }: ClaudeCallArgs) {
  const { anthropicApiKey } = getLifeServerEnv()

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  return (data.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text?.trim())
    .filter(Boolean)
    .join("\n\n");
}
