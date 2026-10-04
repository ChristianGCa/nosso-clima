import type { FastifyInstance } from 'fastify';

import { createVercelApp } from './src/vercel-app.js';

const app: FastifyInstance = createVercelApp(process.env);

export default app;
