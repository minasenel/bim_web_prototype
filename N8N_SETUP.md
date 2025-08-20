# N8N Setup Guide for BİM Web Prototype

## Overview
This project integrates n8n workflows for product search and store location automation. The backend can optionally call n8n webhooks for enhanced processing.

## Architecture
- **Frontend**: Angular app (localhost:4300)
- **Backend**: Node.js/Express API (localhost:3000)
- **N8N**: Automation platform (localhost:5678)
- **Database**: Supabase (PostgreSQL)

## CORS Rules
- Frontend ONLY calls backend APIs
- Backend calls n8n webhooks (server-side only)
- No direct frontend-to-n8n calls allowed

## Environment Variables

### Backend (.env)
```bash
PORT=3000
N8N_SEARCH_WEBHOOK_URL=http://localhost:5678/webhook/search-product
N8N_NEAREST_WEBHOOK_URL=http://localhost:5678/webhook/nearest-store
N8N_SHARED_SECRET=your-secret-key

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

### Root (.env) for Docker
```bash
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
GENERIC_TIMEZONE=Europe/Istanbul
```

## N8N Workflow Setup

### 1. Start N8N
```bash
docker-compose up -d n8n
```

### 2. Access N8N
- URL: http://localhost:5678
- No authentication required (disabled for development)

### 3. Create Webhook Workflows

#### Search Product Webhook
- **Trigger**: Webhook
- **URL**: `/webhook/search-product`
- **Method**: POST
- **Input**: `{ "q": "product_name" }`
- **Output**: `{ "items": [...] }`

#### Nearest Store Webhook
- **Trigger**: Webhook
- **URL**: `/webhook/nearest-store`
- **Method**: POST
- **Input**: `{ "lat": 41.0550, "lng": 29.2300, "productId": 1 }`
- **Output**: `{ "items": [...] }`

## API Endpoints

### Public APIs (Frontend calls these)
- `GET /api/searchProduct?q=product_name`
- `GET /api/nearestStore?lat=41.0550&lng=29.2300&productId=1`

### Internal APIs (N8N calls these)
- `GET /api/_db/searchProduct?q=product_name`
- `GET /api/_db/nearestStore?lat=41.0550&lng=29.2300&productId=1`

## Testing

### 1. Test N8N Webhook
```bash
curl -X POST http://localhost:5678/webhook/search-product \
  -H "Content-Type: application/json" \
  -d '{"q": "tencere"}'
```

### 2. Test Backend API
```bash
curl "http://localhost:3000/api/searchProduct?q=tencere"
```

## Security Notes
- Use Service Role key for backend-to-Supabase calls
- N8N webhooks are internal (localhost only)
- Frontend never directly calls n8n
- All sensitive data in .env (not tracked by git)

## Troubleshooting

### Docker .env Error
- Ensure root `.env` file exists for Docker
- Check environment variable names match docker-compose.yml

### CORS Errors
- Frontend should only call `/api/*` endpoints
- Backend handles n8n communication

### N8N Connection Issues
- Verify port 5678 is not blocked
- Check Docker container is running
- Ensure webhook URLs are correct in backend .env
