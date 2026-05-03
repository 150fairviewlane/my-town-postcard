import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

// The cartographer + dev-banner plugins traverse the entire monorepo on dev
// requests and add measurable latency to a Vite cold start over a slow
// connection (the iPad-via-Replit-preview case). They are useful for the
// in-workspace AI assistant tooling but unnecessary for plain dev work.
// They are now OFF by default and can be re-enabled with
// `REPLIT_VITE_DEV_PLUGINS=1` when needed.
const enableReplitDevPlugins =
  process.env.NODE_ENV !== "production" &&
  process.env.REPL_ID !== undefined &&
  process.env.REPLIT_VITE_DEV_PLUGINS === "1";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(enableReplitDevPlugins
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  // Pre-bundle every npm dependency the landing-page critical path actually
  // touches. In Vite dev each un-prebundled package becomes its own ESM
  // request waterfall in the browser — collapsing them into single
  // pre-bundled chunks is the single biggest win for cold-load time when
  // testing over a slow proxied connection (e.g. iPad → Replit preview).
  optimizeDeps: {
    include: [
      // Critical-path runtime
      "react",
      "react/jsx-runtime",
      "react-dom",
      "react-dom/client",
      "wouter",
      "@tanstack/react-query",
      // Heavy interactive libs used inside the modal
      "framer-motion",
      "recharts",
      "lucide-react",
      "react-icons",
      "react-icons/fa",
      "react-icons/fi",
      "react-icons/md",
      "react-hook-form",
      "@hookform/resolvers",
      // Stripe is imported by the checkout page (lazy) but pre-bundling it
      // keeps the navigation from stalling on a fresh deps build.
      "@stripe/stripe-js",
      "@stripe/react-stripe-js",
      // Notification / toast surfaces eagerly mounted in App.tsx
      "sonner",
      "next-themes",
      // shadcn/ui primitives — every one ends up imported somewhere on the
      // critical path through the toaster, tooltip, button-group, etc.
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "cmdk",
      "vaul",
      "input-otp",
      "embla-carousel-react",
      "react-day-picker",
      "react-resizable-panels",
      "date-fns",
      "zod",
      // All radix-ui packages that ship under @workspace/localspot. They are
      // small individually but together they generate ~50+ separate ESM
      // requests when not pre-bundled.
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    // Pre-transform the landing-page critical path at server start so the
    // first browser request doesn't have to wait for these files to be
    // compiled one by one. Vite runs warmup in parallel with normal
    // requests, so this only speeds up the initial paint and never blocks
    // anything.
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/pages/LandingPage.tsx",
        "./src/PostcardPickerSection.jsx",
        "./src/AdGenerator.jsx",
        "./src/AdAssistant.jsx",
        "./src/postcardCore.jsx",
        "./src/postcardBack.jsx",
        "./src/industryAssets.js",
        "./src/PostcardSampleAds.jsx",
        "./src/MrBiscuitsReferenceAd.jsx",
        "./src/qrUtils.jsx",
        "./src/lib/reservationStorage.js",
        "./src/components/ui/toaster.tsx",
        "./src/components/ui/tooltip.tsx",
      ],
    },
    // Forward /api/* to the api-server in dev. The Replit workspace preview
    // iframe loads this Vite dev server directly (bypassing the shared
    // path-based proxy at port 80), so without this Vite returns 404 for any
    // /api request. In production, the platform-level path proxy handles
    // /api routing to the api-server, so this is dev-only.
    //
    // The AI chat endpoint waits on Anthropic and can take up to 30s, so we
    // raise both timeouts well above the http-proxy defaults to avoid
    // spurious 504s mid-stream. We also wire an `error` handler that emits
    // a structured JSON body — without this, the proxy silently returns an
    // empty/HTML response on api-server hiccups (tsx-watch restart, port
    // reclaim) and the client surfaces the cryptic "AI service unavailable"
    // message after burning all its retries.
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        timeout: 60_000,
        proxyTimeout: 60_000,
        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[vite-proxy] ${req.method} ${req.url} → api-server failed: ${err.message}`,
            );
            if (res && "writeHead" in res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error:
                    "The api-server is briefly unavailable (likely a hot-reload). Retrying…",
                }),
              );
            }
          });
        },
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
