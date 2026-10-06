import { createVercelApp } from './src/vercel-app.js';

const app = createVercelApp(process.env);

void app.listen({ port: 3000 });
