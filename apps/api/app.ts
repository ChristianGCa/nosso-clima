import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel detects Fastify from this runtime import; a type-only import is erased.
import 'fastify';
import { createVercelApp } from './src/vercel-app.js';

const app = createVercelApp(process.env);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  app.server.emit('request', req, res);
}
