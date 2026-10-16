// Device-local presentation metadata. Never included in a simulation model or API payload.
export const backgroundIds = ["hospital", "bank", "restaurant", "warehouse", "customer-service"] as const;
export type BackgroundId = typeof backgroundIds[number];
export interface BackgroundPreferences {
  templateId?: BackgroundId;
  backgroundEnabled: boolean;
}
export const backgroundPreferenceEvent = "astra-project-background-change";
const session = new Map<string, string>();
export function isBackgroundId(value: unknown): value is BackgroundId {
  return backgroundIds.some(id => id === value);
}
export function backgroundKey(projectId?: string) { return `astra-project-background-${projectId ?? "draft"}`; }
export function readBackgroundSnapshot(projectId?: string): string {
  const key = backgroundKey(projectId);
  try { return (projectId ? localStorage.getItem(key) : null) ?? session.get(key) ?? ""; }
  catch { return session.get(key) ?? ""; }
}
export function parseBackgroundPreferences(raw: string): BackgroundPreferences {
  let saved: Partial<BackgroundPreferences> = {};
  try { saved = JSON.parse(raw) ?? {}; } catch { /* Old projects have no preferences. */ }
  const templateId = isBackgroundId(saved.templateId) ? saved.templateId : undefined;
  return { templateId, backgroundEnabled: typeof saved.backgroundEnabled === "boolean" ? saved.backgroundEnabled : Boolean(templateId) };
}
export function writeBackgroundPreferences(projectId: string | undefined, preferences: BackgroundPreferences) {
  const key = backgroundKey(projectId), value = JSON.stringify(preferences);
  session.set(key, value);
  try { if (projectId) localStorage.setItem(key, value); } catch { /* Continue for this session. */ }
  window.dispatchEvent(new Event(backgroundPreferenceEvent));
}
export function rememberProjectTemplate(projectId: string, template: string) {
  if (!isBackgroundId(template) || typeof window === "undefined") return;
  const raw = readBackgroundSnapshot(projectId);
  const saved = parseBackgroundPreferences(raw);
  writeBackgroundPreferences(projectId, raw ? { ...saved, templateId: saved.templateId ?? template } : {
    templateId: template, backgroundEnabled: true,
  });
}
