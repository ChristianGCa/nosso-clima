import type { IncomingMessage, ServerResponse } from 'node:http';

// biome-ignore lint/correctness/noUnusedImports: Required for Vercel's framework detection
import Fastify from 'fastify';
import { createVercelApp } from './src/vercel-app.js';

const app = createVercelApp(process.env);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  app.server.emit('request', req, res);
}
