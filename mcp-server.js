#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MCP Server
class MCPServer {
  constructor() {
    this.tools = [
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
  }

  // List available tools
  listTools() {
    return this.tools;
  }

  // Execute a tool
  async executeTool(name, args) {
    try {
      switch(name) {
        case 'search_products':
          const { data: products, error: pErr } = await supabase
            .from('products')
            .select('*')
            .ilike('name', `%${args.query}%`);
          if (pErr) throw pErr;
          return { 
            products: products || [],
            count: products?.length || 0,
            query: args.query
          };
          
        case 'get_all_stores':
          const { data: stores, error: sErr } = await supabase
            .from('stores')
            .select('*')
            .order('name');
          if (sErr) throw sErr;
          return { 
            stores: stores || [],
            count: stores?.length || 0
          };
          
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
          return { 
            stock: stock || [],
            productId: args.productId,
            availableStores: stock?.length || 0
          };
          
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
          
          return { 
            nearest_stores: storesWithDistance?.slice(0, 3) || [],
            userLocation: { lat: args.lat, lng: args.lng },
            totalStores: storesWithDistance?.length || 0
          };
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      throw new Error(`Tool execution error: ${error.message}`);
    }
  }
}

// HTTP Server
const http = require('http');
const mcpServer = new MCPServer();

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { jsonrpc, method, params, id } = JSON.parse(body);
        
        let result;
        switch(method) {
          case 'tools/list':
            result = { tools: mcpServer.listTools() };
            break;
            
          case 'tools/call':
            const { name, arguments: args } = params;
            result = await mcpServer.executeTool(name, args);
            break;
            
          default:
            throw new Error(`Unknown method: ${method}`);
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id,
          result
        }));
        
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: req.body?.id || 1,
          error: {
            code: -32603,
            message: error.message
          }
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.MCP_PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
  console.log(`📡 n8n'de endpoint olarak şunu kullan: http://localhost:${PORT}/mcp`);
  console.log(`🔧 Available tools: ${mcpServer.tools.map(t => t.name).join(', ')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MCP server...');
  server.close(() => {
    console.log('✅ MCP server stopped');
    process.exit(0);
  });
});
