# Sales Dashboard - Development Setup

## 🎯 Current Status 
**✅ FIXED: Browser PostgreSQL Import Error**
- API Server running on port 8000
- React App running on port 5176 
- Full CRM data accessible (316 companies, 354 deals)

## Overview

This project uses a hybrid approach during development:
- **React App**: Runs on Vite dev server (typically port 5175-5176)
- **API Server**: Express server connecting to Neon PostgreSQL database (port 8000)

## Quick Start

### Option 1: Start Both Servers (Recommended)
```bash
npm run start
# or
npm run dev:all
```

### Option 2: Start Separately
```bash
# Terminal 1 - API Server
npm run dev:api

# Terminal 2 - React App  
npm run dev
```

## Current URLs
- **React App**: http://localhost:5176
- **API Server**: http://localhost:8000
- **Health Check**: http://localhost:8000/api/health
- **Companies API**: http://localhost:8000/api/companies
- **Deals API**: http://localhost:8000/api/deals

## Architecture

### API Server (port 8000)
- **File**: `server/api.js`
- **Database**: Neon PostgreSQL
- **Purpose**: Provides REST API endpoints for CRM data

**Endpoints:**
- `GET /api/health` - Health check
- `GET /api/user` - Mock user data for development
- `GET /api/companies` - Companies with optional stats
- `GET /api/deals` - Deals with full CRM relationships

### React App (port 5175)
- **Framework**: Vite + React + TypeScript
- **API Client**: Fetch API connecting to localhost:8000
- **Purpose**: Sales pipeline dashboard with CRM features

## Services & Hooks

### Updated for API Integration
- `src/lib/services/companyService.ts` - Company operations via API
- `src/lib/hooks/useDeals.ts` - Deals with CRM relationships via API  
- `src/lib/hooks/useUser.ts` - Mock user authentication via API

### Database Integration
The API server connects to Neon PostgreSQL with:
- **316 companies** with domain-based email matching
- **354 deals** with enhanced CRM relationships
- **348 contacts** with 97% auto-linking success rate
- **969 activities** with 740 auto-matched to deals

## Development Notes

1. **No Browser Database Connection**: The `pg` library only works in Node.js, not browsers
2. **API Bridge**: Express server acts as bridge between React app and Neon database
3. **Mock Authentication**: Development uses mock user data (dev-user-123)
4. **CRM Features**: Full companies, contacts, and deal relationships available
5. **Real-time Updates**: Supabase still used for some real-time features

## Troubleshooting

### API Server Issues
- Check port 8000 is available: `lsof -ti:8000`
- Verify Neon connection in API logs
- Test endpoints: `curl http://localhost:8000/api/health`

### React App Issues  
- Check Vite dev server port (usually 5175)
- Verify API base URL in service files points to port 8000
- Check browser dev tools for network errors

### Database Connection
- Ensure Neon database credentials are correct in `server/api.js`
- Verify SSL connection requirement: `?sslmode=require`
- Check firewall/network access to Neon endpoint

## Production Deployment

For production, you'll need to:
1. Deploy API server to a hosting platform (Vercel, Railway, etc.)
2. Update API base URLs in React services to production API URL
3. Configure proper environment variables for database connection
4. Set up proper authentication (remove mock user) 