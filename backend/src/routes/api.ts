import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection';
import { haversineDistanceKm } from '../services/geo';
import { callAutomation } from '../mcp/bridge';

export const apiRouter = Router();

function searchProductsDb(q: string) {
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT p.id, p.name, p.brand, p.category,
            SUM(s.quantity) as totalQuantity
     FROM products p
     LEFT JOIN stock s ON s.product_id = p.id
     WHERE lower(p.name) LIKE lower(?)
        OR lower(p.category) LIKE lower(?)
        OR lower(p.brand) LIKE lower(?)
     GROUP BY p.id
     ORDER BY totalQuantity DESC NULLS LAST
     LIMIT 50`
  );
  return stmt.all(`%${q}%`, `%${q}%`, `%${q}%`);
}

function nearestStoresDb(lat: number, lng: number, productId?: number) {
  const db = getDatabase();
  const stores = db.prepare('SELECT id, name, latitude, longitude, address FROM stores').all();
  const storesWithDistance = stores.map((s) => ({
    ...s,
    distanceKm: haversineDistanceKm(lat, lng, s.latitude, s.longitude),
    quantity: productId
      ? (db.prepare('SELECT quantity FROM stock WHERE product_id = ? AND store_id = ?').get(productId, s.id)?.quantity || 0)
      : undefined,
  }));
  storesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  return storesWithDistance.slice(0, 10);
}

apiRouter.get('/searchProduct', async (req: Request, res: Response) => {
  const schema = z.object({ q: z.string().min(1) });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });

  const { q } = parse.data;
  const webhook = process.env.N8N_SEARCH_WEBHOOK_URL;
  if (webhook) {
    try {
      const data = await callAutomation(webhook, { q });
      return res.json(data);
    } catch (e) {
      // fall back to DB on failure
    }
  }
  const rows = searchProductsDb(q);
  res.json({ items: rows });
});

apiRouter.get('/nearestStore', async (req: Request, res: Response) => {
  const schema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    productId: z.coerce.number().optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });

  const { lat, lng, productId } = parse.data;
  const webhook = process.env.N8N_NEAREST_WEBHOOK_URL;
  if (webhook) {
    try {
      const data = await callAutomation(webhook, { lat, lng, productId });
      return res.json(data);
    } catch (e) {
      // fall back to DB on failure
    }
  }
  res.json({ items: nearestStoresDb(lat, lng, productId) });
});

// Internal DB-only endpoints for n8n workflows
apiRouter.get('/_db/searchProduct', (req: Request, res: Response) => {
  const schema = z.object({ q: z.string().min(1) });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { q } = parse.data;
  res.json({ items: searchProductsDb(q) });
});

apiRouter.get('/_db/nearestStore', (req: Request, res: Response) => {
  const schema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    productId: z.coerce.number().optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { lat, lng, productId } = parse.data;
  res.json({ items: nearestStoresDb(lat, lng, productId) });
});


