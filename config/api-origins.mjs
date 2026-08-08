import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Single source of truth for the MedStudy API Worker origins used by the
// Cloudflare Pages proxy (_worker.js) and the Vite dev proxy.
//
// Staging and production MUST never share an API origin. The build pipeline
// injects exactly one of these into the emitted dist/_worker.js, and the
// regression tests assert that a staging artifact never references the
// production origin and vice versa.
export const WORKER_TOKEN = '__MEDSTUDY_API_ORIGIN__'

export const API_ORIGINS = Object.freeze({
  production: 'https://medstudy-api.medstudy.workers.dev',
  staging: 'https://medstudy-api-staging.medstudy.workers.dev',
})

export function resolveApiOrigin(mode = 'production') {
  return mode === 'staging' ? API_ORIGINS.staging : API_ORIGINS.production
}

// Render the Pages _worker.js source with a concrete API origin injected.
// Used by the Vite build plugin and covered directly by regression tests so a
// misconfigured build is caught before it is ever deployed.
export function renderWorkerSource(apiOrigin) {
  const template = readFileSync(resolve(here, '_worker.template.js'), 'utf8')
  return template.split(WORKER_TOKEN).join(apiOrigin)
}
