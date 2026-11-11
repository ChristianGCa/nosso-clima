import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { resolveApiBaseUrl } from './src/api/base-url.ts';
import {
  resolveSiteContact,
  SITE_CONTACT_VARIABLES,
  siteContactDefine,
} from './src/site-contact.ts';

export default defineConfig(({ command, mode }) => {
  // Only the two named contact variables are read; nothing else from the environment is exposed.
  const contact = loadEnv(mode, process.cwd(), [...SITE_CONTACT_VARIABLES]);
  // Validates always; a Vercel build without its own contact fails instead of shipping none.
  resolveSiteContact(contact, { required: command === 'build' && Boolean(process.env.VERCEL) });

  if (command === 'build') {
    const environment = loadEnv(mode, process.cwd(), 'VITE_');
    const ownOrigin =
      process.env.WEB_ORIGIN ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
    resolveApiBaseUrl(environment.VITE_API_BASE_URL, true, ownOrigin);
  }

  return {
    define: siteContactDefine(contact),
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:3000',
      },
    },
  };
});
