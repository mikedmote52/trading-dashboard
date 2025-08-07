# VIGL Discovery System - Render Deployment Guide

## 🚀 Complete Cloud-Native Architecture

This system deploys three services on Render:

1. **Background Worker** - Runs Python VIGL scanner every 10 minutes
2. **API Service** - FastAPI service serving real-time discoveries  
3. **Frontend Service** - Your existing dashboard consuming the API

## 📋 Prerequisites

1. **Render Account** - Sign up at https://render.com
2. **GitHub Repository** - Your code must be in a GitHub repo
3. **Polygon API Key** - Get from https://polygon.io

## 🛠 Deployment Steps

### Step 1: Deploy from render.yaml

1. **Go to Render Dashboard**
2. **Click "New +"** → **"Blueprint"**
3. **Connect GitHub** repository: `mikedmote52/trading-dashboard`
4. **Use render.yaml** from repository
5. **Click "Apply"**

This will automatically create all three services and the PostgreSQL database.

### Step 2: Set Environment Variables

In each service, go to **Environment** tab and add:

#### VIGL Scanner Worker:
```
POLYGON_API_KEY = your_polygon_api_key_here
```

#### VIGL API Service:
```
DATABASE_URL = (auto-populated from database)
```

#### Frontend Service:
```
VIGL_API_URL = https://vigl-api-service.onrender.com
APCA_API_KEY_ID = your_alpaca_api_key
APCA_API_SECRET_KEY = your_alpaca_secret_key
```

### Step 3: Verify Deployment

1. **Check Background Worker Logs**:
   - Should see: "🔍 Starting VIGL pattern scan..."
   - Should run every 10 minutes

2. **Test API Service**:
   - Visit: `https://vigl-api-service.onrender.com/vigl/latest`
   - Should return JSON with discoveries

3. **Check Frontend**:
   - Visit your frontend URL
   - Click "Scan Market" 
   - Should show real-time VIGL patterns

## 📊 How It Works

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Background Worker │    │    API Service      │    │     Frontend        │
│                     │    │                     │    │                     │
│  • Runs Python     │    │  • FastAPI          │    │  • Your Dashboard   │
│  • Every 10 min    │────│  • Serves /vigl/*   │────│  • Fetches API      │
│  • Saves to DB     │    │  • Real-time data   │    │  • Updates UI       │
│                     │    │                     │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                            ┌─────────────────────┐
                            │   PostgreSQL DB     │
                            │                     │
                            │  • vigl_discoveries │
                            │  • scan_sessions    │
                            │  • Real-time data   │
                            └─────────────────────┘
```

## 🔧 Troubleshooting

### Background Worker Issues:
- Check logs for Python errors
- Verify POLYGON_API_KEY is set
- Ensure database connection

### API Service Issues:
- Check database connectivity
- Verify PostgreSQL service is running
- Test endpoints directly

### Frontend Issues:
- Check VIGL_API_URL is correct
- Verify API service is running
- Check browser network tab

## 📈 Expected Results

After successful deployment:

1. **Background scans** every 10 minutes
2. **Real-time discoveries** in database
3. **Live UI updates** when clicking "Scan Market"
4. **No more mock/fake data**
5. **Works on all devices** (phone, desktop, etc.)

## 🎯 API Endpoints

- `GET /vigl/latest` - Latest discoveries (confidence >= 0.6)
- `GET /vigl/top` - Top patterns (confidence >= 0.8)  
- `GET /vigl/stats` - Scan statistics
- `GET /health` - Service health check

## 💡 Key Benefits

✅ **100% Real Data** - No mock or fake data  
✅ **Automatic Updates** - Scans every 10 minutes  
✅ **Works Everywhere** - Phone, desktop, any device  
✅ **Cloud Native** - No local computer needed  
✅ **Production Ready** - Database persistence, error handling  
✅ **Your Proven Algorithm** - Uses your actual VIGL Python system