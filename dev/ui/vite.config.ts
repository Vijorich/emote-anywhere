import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const project = fileURLToPath(new URL('../..', import.meta.url));

export default {
  root: here,
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [project] },
  },
  build: {
    rollupOptions: {
      input: {
        options: resolve(here, 'options.html'),
        popup: resolve(here, 'popup.html'),
      },
    },
  },
};
