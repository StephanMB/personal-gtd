import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    // NLDD's CSS relies on light-dark(), the Popover API and container
    // queries. Tell the CSS minifier those browsers are the floor so it
    // doesn't "lower" them into something broken (same floor as regelrecht).
    cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari18'],
  },
  // Same port as before, so .claude/launch.json keeps working.
  server: { port: 4321 },
});
