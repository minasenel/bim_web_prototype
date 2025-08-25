import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { apiRouter } from './routes/api';
import { ensureDatabaseInitialized } from './db/connection';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

// Initialize database (ensures tables exist)
ensureDatabaseInitialized();

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiRouter);

// Serve Angular build (dist/frontend)
const browserDist = path.resolve(__dirname, '../../frontend/dist/frontend');
app.use(express.static(browserDist));

// SPA fallback (excluding API routes) - use RegExp for Express 5
app.get(/^\/(?!api(\/|$)).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(browserDist, 'index.html'));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});


