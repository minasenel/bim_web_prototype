# BİM Product Locator Prototype

A full-stack web application prototype for locating BİM products and checking their availability at nearby stores, featuring AI-powered chatbot integration.

## Features

- **Product Search**: Search for products by name with real-time database queries
- **Store Information**: Display nearest store location and address with geolocation
- **Stock Availability**: Show current stock quantities from Supabase database
- **AI Chatbot**: Gemini-powered chatbot for recipe suggestions and product recommendations
- **n8n Automation**: Automated workflows for product search and store location
- **Responsive Design**: Modern Angular frontend with clean UI
- **Real-time API**: Express.js backend with Supabase integration

## Prerequisites

- Node.js 18+ and npm
- Angular CLI
- Docker (for n8n)
- Supabase account
- Google AI API key (Gemini)

## Setup Instructions

### 1. Environment Configuration

Create `backend/.env` file with your credentials:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# n8n Webhook URLs
N8N_SEARCH_WEBHOOK_URL=http://localhost:5678/webhook/searchProduct
N8N_NEAREST_WEBHOOK_URL=http://localhost:5678/webhook/nearestStore
N8N_CHATBOT_WEBHOOK_URL=http://localhost:5678/webhook/chatbot

# Google AI API Key
GOOGLE_AI_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=3000
```

### 2. Database Setup

1. Create Supabase project
2. Run SQL commands in Supabase SQL Editor:
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT
);

CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT
);

CREATE TABLE stock (
  product_id INT REFERENCES products(id),
  store_id INT REFERENCES stores(id),
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY(product_id, store_id)
);
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
```

### 4. Start Services

```bash
# Start n8n (Docker)
docker-compose up -d

# Start Backend
cd backend
npm run dev

# Start Frontend (in new terminal)
cd frontend
npm run build
```

### 5. Seed Database

```bash
cd backend
npm run seed
```

## How to Use

1. Open `http://localhost:3000` in your browser
2. Search for products using the search box
3. Use "Konumumu Kullan" to set your location
4. Click "En yakın mağazayı bul" to find nearest stores
5. Use the chatbot (💬) for recipe suggestions

## Demo Products

The prototype includes sample data for:
- Kitchen appliances (pots, pans, utensils)
- Food items (milk, bread, yogurt, cheese)
- Household items

## Technical Architecture

- **Frontend**: Angular 17 with modern UI components
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Automation**: n8n workflows
- **AI**: Google Gemini Flash API
- **Styling**: SCSS with responsive design

## File Structure

```
bim_web_prototype/
├── frontend/           # Angular application
├── backend/            # Node.js server
├── docker-compose.yml  # n8n configuration
├── .gitignore         # Git ignore rules
└── README.md          # This documentation
```

## Security Notes

- `.env` files are gitignored for security
- Use `.env.example` as template
- Never commit API keys or credentials
- Use environment variables for configuration

## Future Enhancements

- Real-time stock updates
- User authentication
- Store map integration
- Product images and reviews
- Push notifications
- Mobile app version

## Getting Started

1. Follow setup instructions above
2. Configure environment variables
3. Start all services
4. Open `http://localhost:3000`
5. Start searching for products!
