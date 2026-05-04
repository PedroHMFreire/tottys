import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn || !import.meta.env.PROD) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,       // LGPD: oculta texto do usuário nos replays
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
  })
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error(error)
  if (import.meta.env.PROD) {
    Sentry.captureException(error, { extra: context })
  }
}

export function setUserContext(id: string, email?: string) {
  Sentry.setUser({ id, email })
}

export function clearUserContext() {
  Sentry.setUser(null)
}
