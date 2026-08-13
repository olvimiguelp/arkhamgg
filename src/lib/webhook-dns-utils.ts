/**
 * Utility functions for local webhook/DNS resolution
 * Centralizes all localhost URL handling to prevent DNS and configuration issues
 */

/**
 * Build local webhook URL with environment variable fallback
 * @param defaultPort Default port if environment variable is not set (default: 3100)
 * @param defaultPath Default path if environment variable is not set (default: /send)
 * @returns The local webhook URL
 */
export function getLocalWebhookUrl(defaultPort = 3100, defaultPath = "/send"): string {
  const envUrl = (import.meta as any).env?.VITE_REMINDER_LOCAL_WEBHOOK_URL
  if (envUrl) {
    return envUrl
  }
  return `http://localhost:${defaultPort}${defaultPath}`
}

/**
 * Build local webhook health check URL
 * Automatically parses the webhook URL and replaces the path with the health path
 * @param webhookUrl The webhook URL to use for host/port resolution
 * @param healthPath The health check path (default: /health)
 * @returns The local health check URL
 */
export function getLocalHealthUrl(webhookUrl: string, healthPath = "/health"): string {
  const envPath = (import.meta as any).env?.VITE_REMINDER_HEALTH_PATH
  const finalPath = envPath || healthPath
  
  try {
    const url = new URL(webhookUrl)
    url.pathname = finalPath
    return url.toString()
  } catch {
    // Fallback if URL parsing fails
    const defaultUrl = getLocalWebhookUrl()
    try {
      const url = new URL(defaultUrl)
      url.pathname = finalPath
      return url.toString()
    } catch {
      return `http://localhost:3100${finalPath}`
    }
  }
}

/**
 * Get webhook secret from environment
 * @returns The webhook secret or empty string if not set
 */
export function getWebhookSecret(): string {
  return (import.meta as any).env?.VITE_REMINDER_WEBHOOK_SECRET || ""
}

/**
 * Initialize webhook URLs safely
 * Returns both webhook and health URLs with proper error handling
 * @returns Object containing webhook URL and health URL
 */
export function initializeWebhookUrls() {
  const webhookUrl = getLocalWebhookUrl()
  const healthUrl = getLocalHealthUrl(webhookUrl)
  const secret = getWebhookSecret()
  
  return {
    webhookUrl,
    healthUrl,
    secret,
  }
}

/**
 * Build complete webhook configuration
 * Useful for passing webhook config to functions
 * @returns Complete webhook configuration object
 */
export function getWebhookConfig() {
  return initializeWebhookUrls()
}
