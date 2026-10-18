import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this project at /<repository>/; local dev keeps using /.
  base: mode === 'github-pages' ? '/EscapeRoomDesigner/' : '/',
}));
