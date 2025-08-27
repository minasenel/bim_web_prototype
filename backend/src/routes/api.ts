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
  
  const { data, error } = await supabase
    .from('brands3')
    .select('id, product_name, brand_name, category, image_url, stock(quantity)')
    .or(`product_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
    .limit(50);
    
  if (error) throw error;
  
  // Deduplicate by numeric id and also by composite key (name+brand)
  const byId = new Map<number, { id: number; name: string; brand: string; category: string; totalQuantity: number | null; brandLogo: string | null }>();
  const byComposite = new Set<string>();

  (data || []).forEach((p: any) => {
    const idNum = Number(p.id);
    const name: string = p.product_name;
    const brand: string = p.brand_name;
    const category: string = p.category;
    const imageUrl: string | null = p.image_url;
    const compositeKey = `${(name || '').trim().toLowerCase()}__${(brand || '').trim().toLowerCase()}`;

    const currentQuantity = Array.isArray(p.stock)
      ? p.stock.reduce((a: number, s: any) => a + (s?.quantity ? Number(s.quantity) : 0), 0)
      : 0;

    if (Number.isFinite(idNum)) {
      const existing = byId.get(idNum);
      if (existing) {
        const prev = existing.totalQuantity ?? 0;
        existing.totalQuantity = prev + currentQuantity;
      } else if (!byComposite.has(compositeKey)) {
        byId.set(idNum, {
          id: idNum,
          name,
          brand,
          category,
          totalQuantity: currentQuantity,
          brandLogo: imageUrl
        });
        byComposite.add(compositeKey);
      }
    } else {
      // Fallback to composite dedup if id is not numeric
      if (!byComposite.has(compositeKey)) {
        byId.set(byId.size + 1, {
          id: byId.size + 1,
          name,
          brand,
          category,
          totalQuantity: currentQuantity,
          brandLogo: imageUrl
        });
        byComposite.add(compositeKey);
      } else {
        // Aggregate quantity for composite duplicates
        for (const [k, v] of byId.entries()) {
          if (`${v.name.trim().toLowerCase()}__${v.brand.trim().toLowerCase()}` === compositeKey) {
            const prev = v.totalQuantity ?? 0;
            v.totalQuantity = prev + currentQuantity;
            byId.set(k, v);
            break;
          }
        }
      }
    }
  });
  
  return Array.from(byId.values());
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

// Kategorileri getiren endpoint
apiRouter.get('/categories', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('brands3')
      .select('category')
      .order('category');
    
    if (error) throw error;
    
    // Benzersiz kategorileri al
    const uniqueCategories = [...new Set(data?.map(item => item.category) || [])];
    
    res.json({ categories: uniqueCategories });
  } catch (error) {
    console.error('Categories API Error:', error);
    res.status(500).json({ error: 'Categories service unavailable' });
  }
});

// Kategori bazlı ürün getiren endpoint
apiRouter.get('/productsByCategory', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    
    if (!category) {
      return res.status(400).json({ error: 'Category parameter is required' });
    }
    
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('brands3')
      .select('id, product_name, brand_name, category, image_url, stock(quantity)')
      .eq('category', category)
      .order('product_name')
      .limit(500);
    
    if (error) throw error;
    
    // Deduplicate by numeric id and also by composite key (name+brand)
    const byId = new Map<number, { id: number; name: string; brand: string; category: string; totalQuantity: number | null; brandLogo: string | null }>();
    const byComposite = new Set<string>();

    (data || []).forEach((p: any) => {
      const idNum = Number(p.id);
      const name: string = p.product_name;
      const brand: string = p.brand_name;
      const categoryName: string = p.category;
      const imageUrl: string | null = p.image_url;
      const compositeKey = `${(name || '').trim().toLowerCase()}__${(brand || '').trim().toLowerCase()}`;

      const currentQuantity = Array.isArray(p.stock)
        ? p.stock.reduce((a: number, s: any) => a + (s?.quantity ? Number(s.quantity) : 0), 0)
        : 0;

      if (Number.isFinite(idNum)) {
        const existing = byId.get(idNum);
        if (existing) {
          const prev = existing.totalQuantity ?? 0;
          existing.totalQuantity = prev + currentQuantity;
        } else if (!byComposite.has(compositeKey)) {
          byId.set(idNum, {
            id: idNum,
            name,
            brand,
            category: categoryName,
            totalQuantity: currentQuantity,
            brandLogo: imageUrl
          });
          byComposite.add(compositeKey);
        }
      } else {
        if (!byComposite.has(compositeKey)) {
          byId.set(byId.size + 1, {
            id: byId.size + 1,
            name,
            brand,
            category: categoryName,
            totalQuantity: currentQuantity,
            brandLogo: imageUrl
          });
          byComposite.add(compositeKey);
        } else {
          for (const [k, v] of byId.entries()) {
            if (`${v.name.trim().toLowerCase()}__${v.brand.trim().toLowerCase()}` === compositeKey) {
              const prev = v.totalQuantity ?? 0;
              v.totalQuantity = prev + currentQuantity;
              byId.set(k, v);
              break;
            }
          }
        }
      }
    });
    
    const items = Array.from(byId.values());
    
    res.json({ 
      items,
      category: category,
      count: items.length
    });
    
  } catch (error) {
    console.error('Products by category API Error:', error);
    res.status(500).json({ error: 'Products service unavailable' });
  }
});

// Brand logolarını getiren endpoint
apiRouter.get('/brandLogos', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('brands3')
      .select('brand_name, image_url')
      .not('image_url', 'is', null)
      .order('brand_name');
    
    if (error) throw error;
    
    // Benzersiz brand_name'leri al ve image_url'leri map'le
    const brandLogos: Record<string, string> = {};
    data?.forEach(item => {
      if (item.brand_name && item.image_url) {
        brandLogos[item.brand_name] = item.image_url;
      }
    });
    
    res.json({ brandLogos });
  } catch (error) {
    console.error('Brand logos API Error:', error);
    res.status(500).json({ error: 'Brand logos service unavailable' });
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

// Kategorileri fotoğraflarıyla birlikte getiren endpoint
apiRouter.get('/categories-with-images', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    
    // brands3 tablosundan tüm kategorileri al
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('brands3')
      .select('category')
      .order('category');
    
    if (categoriesError) throw categoriesError;
    
    // Benzersiz kategorileri al
    const uniqueCategories = [...new Set(categoriesData?.map(item => item.category) || [])];
    console.log('Brands3\'ten gelen kategoriler:', uniqueCategories);
    
    // Kategori fotoğraflarını al (image_url sütununu kullan)
    const { data: imagesData, error: imagesError } = await supabase
      .from('category_images')
      .select('*');
    
    if (imagesError) throw imagesError;
    
    console.log('Category_images tablosundan gelen veriler:', imagesData);
    
    // Kategori isimlerini normalize et ve eşleştir
    function normalizeCategoryName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[&]/g, 've')
        .replace(/[ü]/g, 'u')
        .replace(/[ı]/g, 'i')
        .replace(/[ş]/g, 's')
        .replace(/[ç]/g, 'c')
        .replace(/[ğ]/g, 'g')
        .replace(/[ö]/g, 'o')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Kategorileri fotoğraflarıyla birleştir
    const categoriesWithImages = uniqueCategories.map(category => {
      const normalizedCategory = normalizeCategoryName(category);
      
      // Fuzzy matching ile eşleştir
      const imageData = imagesData?.find(img => {
        const normalizedImgName = normalizeCategoryName(img.category_name);
        return normalizedImgName === normalizedCategory;
      });
      
      const result = {
        category_name: category,
        image_path: imageData?.image_path || null,
        image_url: imageData?.image_url || null,
        image_id: imageData?.id || null,
        has_image: !!imageData
      };
      
      console.log(`Kategori ${category} için:`, result);
      console.log(`  Normalized: ${normalizedCategory}`);
      if (imageData) {
        console.log(`  Eşleşen: ${imageData.category_name} (${normalizeCategoryName(imageData.category_name)})`);
      }
      return result;
    });
    
    console.log('Final sonuç:', categoriesWithImages);
    
    res.json({ 
      categories: categoriesWithImages,
      count: categoriesWithImages.length
    });
  } catch (error) {
    console.error('Categories with Images API Error:', error);
    res.status(500).json({ error: 'Kategoriler ve fotoğraflar servisi kullanılamıyor' });
  }
});

// Tüm kategori fotoğraflarını getiren endpoint
apiRouter.get('/category-images', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('category_images')
      .select('*')
      .order('category_name');
    
    if (error) throw error;
    
    res.json({ 
      categoryImages: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Category Images API Error:', error);
    res.status(500).json({ error: 'Kategori fotoğrafları servisi kullanılamıyor' });
  }
});

// Belirli bir kategorinin fotoğrafını getiren endpoint
apiRouter.get('/category-images/:categoryName', async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('category_images')
      .select('*')
      .eq('category_name', categoryName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Kategori fotoğrafı bulunamadı' });
      }
      throw error;
    }
    
    res.json({ categoryImage: data });
  } catch (error) {
    console.error('Category Image API Error:', error);
    res.status(500).json({ error: 'Kategori fotoğrafı servisi kullanılamıyor' });
  }
});

// Supabase Storage URL'ini getiren endpoint
apiRouter.get('/supabase-config', async (req: Request, res: Response) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return res.status(500).json({ error: 'SUPABASE_URL not configured' });
    }
    
    // Storage URL'ini oluştur
    const storageUrl = `${supabaseUrl}/storage/v1/object/public/`;
    
    res.json({ 
      supabaseUrl,
      storageUrl,
      bucket: 'categories'
    });
  } catch (error) {
    console.error('Supabase Config API Error:', error);
    res.status(500).json({ error: 'Supabase config service unavailable' });
  }
});


