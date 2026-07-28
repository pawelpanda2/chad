export type AiPromptKind = "our_custom" | "openai_managed";

export const AI_PROMPT_KIND_OPTIONS: Array<{
  value: AiPromptKind;
  label: string;
}> = [
  { value: "our_custom", label: "Our Custom Prompt" },
  { value: "openai_managed", label: "OpenAI Managed Prompt" },
];

export function normalizeAiPromptKind(
  kind: string | undefined | null
): AiPromptKind {
  return kind === "openai_managed" ? "openai_managed" : "our_custom";
}

export function aiPromptKindLabel(kind: string | undefined | null): string {
  const normalized = normalizeAiPromptKind(kind);
  return AI_PROMPT_KIND_OPTIONS.find((o) => o.value === normalized)?.label ?? normalized;
}

export function slugifyPromptName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `prompt-${Date.now().toString(36)}`;
}
