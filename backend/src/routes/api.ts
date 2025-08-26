import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../db/connection';
import { haversineDistanceKm } from '../services/geo';
import axios from 'axios';

export const apiRouter = Router();

// Simple automation function for calling n8n webhooks
async function callAutomation(flowUrl: string, payload: unknown): Promise<unknown> {
  const response = await axios.post(flowUrl, payload, { timeout: 15_000 });
  return response.data;
}

// ... existing code ...

async function searchProductsDb(q: string) {
  const supabase = getSupabase();
  
  // Hem ürün adında hem de marka adında arama yap
  const { data, error } = await supabase
    .from('brands3')
    .select('id, product_name, brand_name, category, stock(quantity)')
    .or(`product_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
    .limit(50);
    
  if (error) throw error;
  
  // Aggregate totalQuantity from related stock rows if present
  const items = (data || []).map((p: any) => ({
    id: p.id,
    name: p.product_name,
    brand: p.brand_name,
    category: p.category,
    totalQuantity: Array.isArray(p.stock) ? p.stock.reduce((a: number, s: any) => a + (s.quantity || 0), 0) : null,
  }));
  return items;
}

// ... existing code ...

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
        .eq('brands3_id', productId)  // 'product_id' yerine 'brands3_id' kullan
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

// Simple chatbot endpoint - works with minimal n8n workflow
apiRouter.post('/chatbot-simple', async (req: Request, res: Response) => {
  const { message, userId } = req.body;
  
  console.log('🔍 Simple chatbot endpoint called with:', { message, userId });
  
  try {
    // 1. Önce n8n webhook'a gönder (AI tarif üretsin)
    const webhook = process.env.N8N_CHATBOT_WEBHOOK_URL;
    if (webhook) {
      try {
        console.log('📡 Calling minimal n8n webhook:', webhook);
        const aiResponse = await callAutomation(webhook, { 
          message, 
          userId
        });
        console.log('✅ AI response received:', aiResponse);
        console.log('📊 AI response type:', typeof aiResponse);
        console.log('📊 AI response keys:', Object.keys(aiResponse || {}));
        
        // DEBUG: AI response'u detaylı incele
        console.log('🔍 FULL AI RESPONSE:');
        console.log(JSON.stringify(aiResponse, null, 2));
        
        // DEBUG: Content structure'ı kontrol et
        if (aiResponse && typeof aiResponse === 'object' && aiResponse !== null) {
          console.log('🔍 Content exists:', 'content' in aiResponse);
          if ('content' in aiResponse && aiResponse.content && typeof aiResponse.content === 'object') {
            console.log('🔍 Content type:', typeof aiResponse.content);
            console.log('🔍 Content keys:', Object.keys(aiResponse.content));
            
            if ('parts' in aiResponse.content && Array.isArray(aiResponse.content.parts)) {
              console.log('🔍 Parts length:', aiResponse.content.parts.length);
              console.log('🔍 First part:', aiResponse.content.parts[0]);
              
              if (aiResponse.content.parts[0] && typeof aiResponse.content.parts[0] === 'object' && 'text' in aiResponse.content.parts[0]) {
                console.log('🔍 Text found:', (aiResponse.content.parts[0] as any).text);
              } else {
                console.log('❌ Text not found in first part');
              }
            } else {
              console.log('❌ Parts not found or not array');
            }
          } else {
            console.log('❌ Content not found');
          }
        }
        
        // 2. AI yanıtından malzemeleri çıkar
        let ingredients: string[] = [];
        if (aiResponse && typeof aiResponse === 'object' && 'content' in aiResponse && 
            aiResponse.content && typeof aiResponse.content === 'object' && 'parts' in aiResponse.content && 
            Array.isArray(aiResponse.content.parts) && aiResponse.content.parts[0]) {
          const aiText = (aiResponse.content.parts[0] as any).text;
          
          // JSON formatında yanıt varsa malzemeleri çıkar
          try {
            const jsonMatch = aiText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              const recipeData = JSON.parse(jsonMatch[1]);
              ingredients = recipeData.ingredients || [];
            }
          } catch (parseError) {
            console.log('❌ JSON parse error:', parseError);
          }
        }
        
        // 3. Malzemeleri database'de ara ve en yakın mağazaları bul
        const supabase = getSupabase();
        const ingredientStores: any[] = [];
        
        for (const ingredient of ingredients) {
          console.log('🔍 Searching for ingredient:', ingredient);
          
          const { data: products, error } = await supabase
            .from('brands3')
            .select('*')
            .ilike('product_name', `%${ingredient}%`)
            .limit(5);
          
          if (products && products.length > 0) {
            // Bu malzeme için en yakın mağazayı bul
            const { data: stores } = await supabase
              .from('stores')
              .select('*')
              .limit(10);
            
            if (stores && stores.length > 0) {
              // Default Istanbul koordinatları (41.0082, 28.9784)
              const storesWithDistance = stores.map(store => ({
                ...store,
                distanceKm: haversineDistanceKm(41.0082, 28.9784, Number(store.latitude), Number(store.longitude))
              })).sort((a, b) => a.distanceKm - b.distanceKm);
              
              ingredientStores.push({
                ingredient: ingredient,
                found: true,
                nearestStore: storesWithDistance[0],
                alternativeStores: storesWithDistance.slice(1, 3)
              });
            }
          } else {
            ingredientStores.push({
              ingredient: ingredient,
              found: false,
              message: `${ingredient} BİM'de bulunamadı`
            });
          }
        }
        
        // 4. AI yanıtına mağaza bilgilerini ekle
        const enhancedResponse = {
          ...(typeof aiResponse === 'object' ? aiResponse : {}),
          ingredientStores: ingredientStores
        };
        
        return res.json(enhancedResponse);
        
      } catch (e) {
        console.error('❌ n8n webhook error:', e);
      }
    }
    
    // Fallback response
    res.json({ 
      recipe: `${message} tarifi için AI servisi şu anda kullanılamıyor.`,
      ingredients: [],
      cooking_time: "Bilinmiyor",
      difficulty: "Bilinmiyor",
      instructions: "Lütfen tekrar deneyin.",
      ingredientStores: []
    });
    
  } catch (error) {
    console.error('❌ Simple chatbot error:', error);
    res.json({ 
      error: 'Chatbot service error',
      message: 'Lütfen tekrar deneyin.'
    });
  }
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
          .from('brands3')
          .select('*')
          .or(`product_name.ilike.%${args.query}%,brand_name.ilike.%${args.query}%`);
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
            brands3!inner(id, product_name, brand_name, category),
            stores!inner(id, name, latitude, longitude, address)
          `)
          .eq('brands3_id', args.productId)
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

// Chat endpoint - forwards to n8n workflow
apiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    
    const webhookUrl = process.env.NODE_ENV === 'production' 
      ? process.env.N8N_WEBHOOK_URL_PROD
      : process.env.N8N_WEBHOOK_URL_TEST;
    
    if (!webhookUrl) {
      return res.status(500).json({ error: 'Webhook URL not configured' });
    }
    
    const response = await axios.post(webhookUrl, {
      chatInput: message,
      sessionId: sessionId
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Chat service unavailable' });
  }
});


