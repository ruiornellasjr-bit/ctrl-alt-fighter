import { defineConfig } from 'vite';

// GitHub Pages serves project repos from a subpath (https://<user>.github.io/<repo>/),
// not from the domain root. Vite's `base` must match that subpath in production builds,
// while local dev (`pnpm dev`) should keep serving from root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ctrl-alt-fighter/' : '/',
}));
