// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Nitro off: it defaults to the cloudflare-module preset and redirects the
  // build into .output/, which is a deploy target this app no longer has -
  // the POS is served by billerpe-local-exe off local disk, not by a worker.
  // It also broke the SPA prerender outright: the prerenderer boots the
  // build's own preview server at dist/server/server.js, which never exists
  // while Nitro is rewriting the output layout ("Cannot find module
  // dist\server\server.js" -> "Prerendered 0 pages").
  nitro: false,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // SPA mode, so the build emits a static HTML shell instead of rendering
    // every page on a server at request time. This is what lets
    // billerpe-local-exe serve the POS off local disk (see
    // WEB-BUNDLE-DELIVERY-PLAN.md): with SSR the browser cannot load the app
    // at all without reaching a running server, which defeats the whole
    // point of billing offline. Nothing is lost here - the POS sits behind
    // a login, needs no SEO, and every byte of its data already comes from
    // the exe's own API, so server-rendering the first paint bought nothing.
    // outputPath overrides the default "/_shell" so the shell lands exactly
    // where express.static expects an SPA's entry point.
    spa: {
      enabled: true,
      prerender: { outputPath: "/index.html" },
    },
  },
});
