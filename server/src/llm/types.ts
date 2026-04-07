export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  userAgent?: string   // optional User-Agent override (e.g. Kimi Coding requires 'claude-code/1.0')
}

export function loadProviderConfigs(): ProviderConfig[] {
  const raw = process.env.LLM_PROVIDERS
  if (!raw) throw new Error('LLM_PROVIDERS env var not set')
  return JSON.parse(raw) as ProviderConfig[]
}
