import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../db/connection';
import { haversineDistanceKm } from '../services/geo';
import { callAutomation } from '../mcp/bridge';

export const apiRouter = Router();

async function searchProductsDb(q: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, category, stock:stock(quantity)')
    .ilike('name', `%${q}%`)
    .limit(50);
  if (error) throw error;
  // Aggregate totalQuantity from related stock rows if present
  const items = (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    totalQuantity: Array.isArray(p.stock) ? p.stock.reduce((a: number, s: any) => a + (s.quantity || 0), 0) : null,
  }));
  return items;
}

async function nearestStoresDb(lat: number, lng: number, productId?: number) {
  const supabase = getSupabase();
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, latitude, longitude, address');
  if (error) throw error;
  const items = (stores || []).map((s: any) => ({
    ...s,
    distanceKm: haversineDistanceKm(lat, lng, Number(s.latitude), Number(s.longitude)),
  }));
  if (productId) {
    for (const s of items) {
      const { data: stk } = await supabase
        .from('stock')
        .select('quantity')
        .eq('product_id', productId)
        .eq('store_id', s.id)
        .limit(1)
        .maybeSingle();
      s.quantity = stk?.quantity ?? 0;
    }
  }
  items.sort((a: any, b: any) => a.distanceKm - b.distanceKm);
  return items.slice(0, 10);
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
  const rows = await searchProductsDb(q);
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
  res.json({ items: await nearestStoresDb(lat, lng, productId) });
});

// Internal DB-only endpoints for n8n workflows
apiRouter.get('/_db/searchProduct', async (req: Request, res: Response) => {
  const schema = z.object({ q: z.string().min(1) });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { q } = parse.data;
  res.json({ items: await searchProductsDb(q) });
});

apiRouter.get('/_db/nearestStore', async (req: Request, res: Response) => {
  const schema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    productId: z.coerce.number().optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { lat, lng, productId } = parse.data;
  res.json({ items: await nearestStoresDb(lat, lng, productId) });
});

// Chatbot endpoint - forwards to n8n workflow with Gemini integration
apiRouter.post('/chatbot', async (req: Request, res: Response) => {
  const { message, userId } = req.body;
  
  // Forward to n8n webhook for Gemini + Supabase processing
  const webhook = process.env.N8N_CHATBOT_WEBHOOK_URL;
  if (webhook) {
    try {
      const response = await callAutomation(webhook, { message, userId });
      return res.json(response);
    } catch (e) {
      // Fallback response if n8n is unavailable
      res.json({ 
        error: 'Chatbot service temporarily unavailable',
        message: 'Please try again later or contact support.'
      });
    }
  }
  
  res.json({ error: 'Chatbot service not configured' });
});


