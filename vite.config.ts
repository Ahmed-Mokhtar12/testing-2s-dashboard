import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Split the three vendor families that every route needs out of the entry chunk.
//
// WHY. The entry chunk is downloaded before anything renders, on every route
// including /auth — measured FCP 2160 ms cold on the LOGIN page
// (docs/perf/hotel-training-baseline.md). Splitting costs ~14 kB gzip on a first
// visit (extra chunk boundaries) and saves ~115 kB gzip on every visit after a
// deploy: /assets/* is served `immutable` (public/serve.json), so a chunk is
// re-fetched only when its content hash changes, and application code changes far
// more often than React, Radix or supabase-js do. Entry alone: 659 kB. Split:
// a 283 kB entry plus 426 kB of vendor that a code change does not invalidate.
//
// RETURN undefined FOR EVERYTHING ELSE — that is the part that matters. A catch-all
// `return 'vendor'` was tried first and made things WORSE: it swept route-only
// dependencies (recharts for the chart pages, emoji-picker-react for WhatsApp,
// ~570 kB between them) into a chunk the entry needs part of, so all of it became
// an eager download — 1638 kB eager, where the unsplit entry was 1537 kB. Leaving
// them alone keeps Rollup's own route-based splitting, which was already right.
//
// That version also crashed the built app outright with "Cannot access 'P' before
// initialization", a cross-chunk circular import that `vite dev` cannot reproduce
// because it does not bundle. It reached the live site before being caught. That is
// why PW_BUILD exists in playwright.config.ts, and why any change to this function
// must be verified with it rather than with the default suite.
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  // react-dom reaches into scheduler's module state, so these three stay together.
  // Separating them is the standard way to produce the TDZ error above.
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';

  // ~30 packages, all present on the dashboard shell.
  if (id.includes('node_modules/@radix-ui/')) return 'vendor-radix';

  if (id.includes('node_modules/@supabase/')) return 'vendor-supabase';

  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
}));
