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

// Simplified MCP endpoint for n8n
apiRouter.post('/mcp', async (req: Request, res: Response) => {
  try {
    // Always return tools list for now
    const tools = [
      {
        name: 'search_products',
        description: 'Search products in Supabase database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_all_stores',
        description: 'Get all stores from database',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];

    res.json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      result: { tools }
    });

  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      error: {
        code: -32603,
        message: 'Internal error'
      }
    });
  }
});

// n8n MCP Server-Sent Events endpoint
apiRouter.get('/mcp/sse', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type": "connection", "message": "MCP Server connected"}\n\n');

  // Handle client disconnect
  req.on('close', () => {
    console.log('MCP client disconnected');
  });

  // Keep connection alive
  const interval = setInterval(() => {
    res.write('data: {"type": "ping", "timestamp": "' + new Date().toISOString() + '"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// MCP tools endpoint for n8n
apiRouter.post('/mcp/tools', async (req: Request, res: Response) => {
  try {
    const tools = [
      {
        name: 'search_products',
        description: 'Search products in Supabase database by name',
        inputSchema: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Product search query (e.g., "mercimek", "tencere")' 
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_all_stores',
        description: 'Get all BİM stores with location and address information',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_stock_info',
        description: 'Get stock information for a specific product across all stores',
        inputSchema: {
          type: 'object',
          properties: {
            productId: { 
              type: 'number', 
              description: 'Product ID to check stock for' 
            }
          },
          required: ['productId']
        }
      },
      {
        name: 'find_nearest_store',
        description: 'Find the nearest BİM store to given coordinates',
        inputSchema: {
          type: 'object',
          properties: {
            lat: { 
              type: 'number', 
              description: 'Latitude coordinate (e.g., 41.0082 for Istanbul)' 
            },
            lng: { 
              type: 'number', 
              description: 'Longitude coordinate (e.g., 28.9784 for Istanbul)' 
            },
            productId: { 
              type: 'number', 
              description: 'Product ID to check availability' 
            }
          },
          required: ['lat', 'lng', 'productId']
        }
      }
    ];

    res.json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      result: { tools }
    });

  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    });
  }
});

// MCP tool execution endpoint
apiRouter.post('/mcp/execute', async (req: Request, res: Response) => {
  const { tool, arguments: args } = req.body;
  
  try {
    const supabase = getSupabase();
    let result;
    
    switch(tool) {
      case 'search_products':
        const { data: products, error: pErr } = await supabase
          .from('products')
          .select('*')
          .ilike('name', `%${args.query}%`);
        if (pErr) throw pErr;
        result = { 
          products: products || [],
          count: products?.length || 0,
          query: args.query
        };
        break;
        
      case 'get_all_stores':
        const { data: stores, error: sErr } = await supabase
          .from('stores')
          .select('*')
          .order('name');
        if (sErr) throw sErr;
        result = { 
          stores: stores || [],
          count: stores?.length || 0
        };
        break;
        
      case 'get_stock_info':
        const { data: stock, error: stErr } = await supabase
          .from('stock')
          .select(`
            quantity,
            products(id, name, brand, category),
            stores(id, name, latitude, longitude, address)
          `)
          .eq('product_id', args.productId)
          .gt('quantity', 0);
        if (stErr) throw stErr;
        result = { 
          stock: stock || [],
          productId: args.productId,
          availableStores: stock?.length || 0
        };
        break;
        
      case 'find_nearest_store':
        const { data: allStores, error: nsErr } = await supabase
          .from('stores')
          .select('*');
        if (nsErr) throw nsErr;
        
        const storesWithDistance = allStores?.map(store => {
          const distance = Math.sqrt(
            Math.pow(store.latitude - args.lat, 2) + 
            Math.pow(store.longitude - args.lng, 2)
          );
          return { ...store, distanceKm: (distance * 111).toFixed(2) };
        }).sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));
        
        result = { 
          nearest_stores: storesWithDistance?.slice(0, 3) || [],
          userLocation: { lat: args.lat, lng: args.lng },
          totalStores: storesWithDistance?.length || 0
        };
        break;
        
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
    
    res.json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      result
    });
    
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    });
  }
});


