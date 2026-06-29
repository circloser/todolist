// Ambient types for Cloudflare Worker bindings used via `cloudflare:workers`.
// Augments the `env` object's type so `env.DB` is strongly typed.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ASSETS: Fetcher;
    }
  }
}

export {};
