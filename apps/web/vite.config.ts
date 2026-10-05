import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { resolveApiBaseUrl } from './src/api/base-url.ts';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const environment = loadEnv(mode, process.cwd(), 'VITE_');
    const ownOrigin =
      process.env.WEB_ORIGIN ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
    resolveApiBaseUrl(environment.VITE_API_BASE_URL, true, ownOrigin);
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:3000',
      },
    },
  };
});
