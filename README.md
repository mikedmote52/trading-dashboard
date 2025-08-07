# Trading Intelligence Dashboard

Unified VIGL Discovery + Portfolio Management system that actually deploys successfully.

## 🎯 Features

- **Portfolio Management**: Monitor Alpaca positions with WOLF risk analysis
- **VIGL Discovery**: Find stocks matching the proven 324% winner pattern  
- **Real-time Dashboard**: Clean web interface with live updates
- **Mock Data Support**: Works without API keys for testing

## 🚀 Quick Deploy to Render

1. **Fork/Clone this repository**
2. **Connect to Render**: 
   - New Web Service → Connect GitHub repo
   - Render auto-detects `render.yaml` configuration
3. **Add Environment Variables** (optional):
   ```
   APCA_API_KEY_ID=your_alpaca_key
   APCA_API_SECRET_KEY=your_alpaca_secret
   APCA_API_BASE_URL=https://paper-api.alpaca.markets
   ```
4. **Deploy**: Render builds and deploys automatically

## 🧪 Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
open http://localhost:3001
```

## 📊 How It Works

### VIGL Pattern Detection
- Scans for 20.9x+ volume spikes
- Analyzes price momentum and breakout strength  
- Scores similarity to VIGL's 324% pattern
- Provides confidence ratings and upside estimates

### WOLF Risk Analysis  
- Calculates risk scores for each position
- Prevents -25% losses with early warnings
- Generates BUY_MORE/HOLD/SELL recommendations
- Monitors position size and volatility factors

### Unified Intelligence
- Single dashboard combining both systems
- Real-time alerts and notifications
- Mock data fallbacks for reliable demos
- Mobile-responsive interface

## 🔧 Configuration

The system works in two modes:

1. **Mock Data Mode** (default): Displays sample data for demonstration
2. **Live Mode**: Connect with Alpaca API keys for real portfolio data

## 📈 VIGL Reference Pattern

Based on the proven 324% winner:
- Volume Spike: 20.9x average volume
- Price Range: Originally $2.94-$4.66 
- Market Cap: ~$50M microcap
- Momentum: Sustained breakout pattern

## ⚡ Why This Works

- **Single-file architecture**: No complex dependencies  
- **Minimal requirements**: Only Express + CORS
- **Mock data capability**: Demos work immediately
- **Deployment-optimized**: Built specifically for Render
- **Error handling**: Graceful fallbacks throughout

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Pure HTML/CSS/JS + TailwindCSS
- **Deployment**: Render (auto-deploy from GitHub)
- **APIs**: Alpaca Markets (paper trading)

Built for reliability and successful deployment on first try.
