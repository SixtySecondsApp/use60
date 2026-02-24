export function getWebhookBaseUrl(): string {
  return import.meta.env.VITE_WEBHOOK_BASE_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
}
