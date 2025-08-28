# BİM Web Prototype

A modern web application prototype for BİM (Turkish retail chain) featuring product search, store location services, and an AI-powered recipe chatbot. Built with Angular frontend, Node.js backend, and integrated with Supabase database and n8n automation workflows.

## 🌐 Live Demo

**🚀 Try it out: [https://bim-web-prototype.vercel.app/](https://bim-web-prototype.vercel.app/)**

## 🚀 Features

- **Product Search**: Search products by name with real-time results
- **Category Browsing**: Browse products by categories with visual category cards
- **Store Locator**: Find nearest stores based on geolocation
- **AI Recipe Chatbot**: Interactive chatbot for recipe suggestions and cooking assistance
- **Brand Integration**: Display brand logos and information
- **Responsive Design**: Modern, mobile-friendly UI built with Angular
- **Automation Workflows**: n8n integration for enhanced backend processing

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    ┌─────────────────┐    ┌─────────────────┐
│   (Angular)     │◄──►│  (Node.js/      │◄──►│  (Automation)   │
│   Port: 4300    │    │   Express)      │    │   Port: 5678    │
│                 │    │   Port: 3000    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │    Supabase     │
                       │   (Database)    │
                       └─────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **Framework**: Angular 20
- **Language**: TypeScript
- **Styling**: SCSS
- **HTTP Client**: Angular HttpClient
- **State Management**: Angular Signals

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 5
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Validation**: Zod

### Infrastructure
- **Database**: Supabase
- **Automation**: n8n
- **Containerization**: Docker
- **Environment**: dotenv
- **Deployment**: Vercel

## 📁 Project Structure

```
bim_web_prototype/
├── frontend/                 # Angular application
│   ├── src/app/             # Main application code
│   ├── api/                 # API integration files
│   ├── assets/              # Images and static files
│   └── package.json         # Frontend dependencies
├── backend/                  # Node.js server
│   ├── src/                 # Source code
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   └── db/              # Database connection
│   ├── scripts/             # Database seeding
│   └── package.json         # Backend dependencies
├── n8n_data/                # n8n workflow data
├── docker-compose.yml       # Docker services
└── README.md                # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker and Docker Compose
- Supabase account and project

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bim_web_prototype
```

### 2. Environment Setup

Create environment files for both frontend and backend:

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```bash
PORT=3000
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
N8N_SEARCH_WEBHOOK_URL=http://localhost:5678/webhook/search-product
N8N_NEAREST_WEBHOOK_URL=http://localhost:5678/webhook/nearest-store
N8N_SHARED_SECRET=your-secret-key
```

#### Frontend (.env)
```bash
cd frontend
cp config.example.ts config.ts
```

### 3. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Start n8n (Optional)

```bash
# Start n8n automation service
docker-compose up -d n8n
```

Access n8n at: http://localhost:5678

### 5. Start Development Servers

#### Terminal 1 - Backend
```bash
cd backend
npm run dev
```

#### Terminal 2 - Frontend
```bash
cd frontend
npm start
```

### 6. Access the Application

- **Frontend**: http://localhost:4300
- **Backend API**: http://localhost:3000
- **n8n**: http://localhost:5678
- **Live Demo**: [https://bim-web-prototype.vercel.app/](https://bim-web-prototype.vercel.app/)

## 🔧 API Endpoints

### Product Search
- `GET /api/searchProduct?q=product_name` - Search products by name
- `GET /api/productsByCategory?category=category_name` - Get products by category

### Store Location
- `GET /api/nearestStore?lat=41.0550&lng=29.2300&productId=1` - Find nearest store

### Categories
- `GET /api/categories` - Get all product categories
- `GET /api/categories-with-images` - Get categories with images

### Brand Information
- `GET /api/brandLogos` - Get brand logos and information

### Chatbot
- `POST /api/chat` - Send message to AI recipe chatbot

## 🗄️ Database Schema

The application uses Supabase with the following main tables:

- **products**: Product information, prices, and availability
- **categories**: Product categories with images
- **brands3**: Brand information and logos
- **stores**: Store locations and details

## 🤖 AI Chatbot Features

The integrated chatbot provides:
- Recipe suggestions based on ingredients
- Cooking instructions and tips
- Ingredient substitutions
- Meal planning assistance
- Turkish language support

## 🐳 Docker Support

### Start n8n Service
```bash
docker-compose up -d n8n
```

### Stop n8n Service
```bash
docker-compose down
```

## 📱 Features in Detail

### Product Search
- Real-time search with debounced input
- Category-based filtering
- Brand logo display
- Product images and details

### Store Locator
- GPS-based location detection
- Nearest store calculation
- Store information display
- Product availability at stores

### Category Browsing
- Visual category cards
- Product counts per category
- Responsive grid layout
- Image-based navigation

## 🔒 Security Features

- CORS protection between services
- Environment variable configuration
- Supabase service role authentication
- Internal webhook communication only

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### API Testing
```bash
# Test product search
curl "http://localhost:3000/api/searchProduct?q=tencere"

# Test category products
curl "http://localhost:3000/api/productsByCategory?category=Meyve%20ve%20Sebze"
```

## 🚀 Deployment

### Production Build

#### Frontend
```bash
cd frontend
npm run build
```

#### Backend
```bash
cd backend
npm run build
npm start
```

### Vercel Deployment
The project is currently deployed on Vercel at [https://bim-web-prototype.vercel.app/](https://bim-web-prototype.vercel.app/)

### Environment Variables
Ensure all production environment variables are set:
- Supabase credentials
- API keys
- Database connection strings
- n8n webhook URLs (if using automation)

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure frontend only calls `/api/*` endpoints
   - Check backend CORS configuration

2. **Supabase Connection Issues**
   - Verify environment variables
   - Check Supabase project status
   - Ensure proper API keys

3. **n8n Connection Problems**
   - Verify Docker container is running
   - Check port 5678 availability
   - Validate webhook URLs in backend

4. **Image Loading Issues**
   - Check image paths in categories
   - Verify Supabase storage permissions
   - Ensure proper image URLs

### Logs

Check application logs for detailed error information:
- Backend: Console output and error logs
- Frontend: Browser console and network tab
- n8n: Docker logs and n8n interface

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For support and questions:
- Check the troubleshooting section
- Review n8n setup documentation
- Examine API endpoints and responses
- Check browser console for frontend errors
- Visit the live demo: [https://bim-web-prototype.vercel.app/](https://bim-web-prototype.vercel.app/)

## 🔄 Updates and Maintenance

- Keep dependencies updated
- Monitor Supabase usage and limits
- Review n8n workflow performance
- Update environment variables as needed

---

**Note**: This is a prototype application. For production use, ensure proper security measures, error handling, and performance optimization are implemented.

**🌐 Live Demo**: [https://bim-web-prototype.vercel.app/](https://bim-web-prototype.vercel.app/)
