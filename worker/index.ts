/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { sendAllDeadlineAlerts } from "../app/api/deadline-alerts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  // Cron trigger (weekdays 00:00 UTC = 09:00 KST, see
  // scripts/prepare-cloudflare-config.mjs). Calls the alert code directly:
  // going through the HTTP API would need a signed-in user, which a cron
  // run does not have. Sends for every board whose webhook is switched on;
  // each result (sent / failed) is written to that board's history.
  async scheduled(_event: unknown, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      sendAllDeadlineAlerts().then(
        (results) => {
          console.log(
            `[deadline-alerts] ${results.length} board(s): ${results
              .map((result) => `${result.workspaceId}=${result.status}`)
              .join(", ") || "none enabled"}`
          );
        },
        (error) => console.error("[deadline-alerts] failed", error)
      )
    );
  },
};

export default worker;
