// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages: https://sirret.github.io/FarmerHackaton10/
  site: 'https://sirret.github.io',
  base: '/FarmerHackaton10',
  output: 'static',
  trailingSlash: 'ignore',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [preact()]
});
