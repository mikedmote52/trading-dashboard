# AlphaStack V3 - High-Performance React Trading Component

## Overview

AlphaStack V3 is a blazing-fast, dense, and glanceable React TypeScript component designed for financial professionals. It provides real-time trading data visualization with sub-100ms updates and <2-second load times.

## 🚀 Performance Features

### Speed Optimizations
- **Sub-2 second load times** with intelligent caching
- **<100ms update cycles** using React concurrent features
- **Request deduplication** prevents duplicate API calls
- **Virtualization** for large datasets (50+ items)
- **Lazy loading** for non-critical components

### Memory Management
- **React.memo** for candidate cards prevents unnecessary re-renders
- **useMemo/useCallback** for expensive computations
- **Automatic cleanup** of event listeners and timers
- **Garbage collection friendly** data structures

### Network Optimization
- **Intelligent caching** with TTL and staleness detection
- **Background refresh** without blocking UI
- **Graceful degradation** when APIs fail
- **Circuit breaker** pattern for API reliability

## 🎯 Core Features

### AlphaStack Protection (Immutable)
- **Read-only operations** - never modifies discovery algorithms
- **Protected endpoints** - only consumes `/api/v2/scan/squeeze`
- **Feature flag controlled** - instant rollback capability
- **Error boundaries** - prevents crashes from propagating

### Data Display
- **Dense, scannable layout** optimized for financial professionals
- **Real-time price updates** with color-coded changes
- **Entry thesis display** with profit targets and stop losses
- **Comprehensive metrics** including RSI, volume, short interest
- **Sentiment analysis** from Reddit, StockTwits, and other sources

### User Interactions
- **One-click trading** integration with existing buy functionality
- **Watchlist management** - add/remove stocks instantly
- **Candidate selection** - detailed view modal support
- **Mobile-first responsive** design for all screen sizes

## 🏗️ Architecture

### Component Structure
```
src/components/
├── AlphaStackV3.tsx           # Main component
├── AlphaStackV3.module.css    # Performance-optimized styles
└── README.md                  # This file

src/types/
└── alphastack.ts              # TypeScript definitions

src/hooks/
└── useAlphaStackData.ts       # Custom hooks for data management

src/integration/
└── AlphaStackV3Integration.js # Bridge for vanilla JS integration
```

### Data Flow
```
API Endpoint (/api/v2/scan/squeeze)
    ↓
Request Deduplication Layer
    ↓
Intelligent Cache (30s TTL)
    ↓
React Hook (useAlphaStackData)
    ↓
AlphaStack V3 Component
    ↓
Memoized Candidate Cards
    ↓
User Actions (Buy/Watchlist)
```

## 🔧 Integration

### React Integration (Preferred)
```typescript
import { AlphaStackV3WithErrorBoundary } from './src/components/AlphaStackV3';

function TradingDashboard() {
  return (
    <AlphaStackV3WithErrorBoundary
      autoRefresh={true}
      refreshInterval={30000}
      onCandidateSelect={(candidate) => {
        console.log('Selected:', candidate.ticker);
      }}
      onError={(error) => {
        console.error('AlphaStack error:', error);
      }}
    />
  );
}
```

### Vanilla JS Integration (Bridge)
```javascript
// Initialize within existing vanilla JS system
window.initAlphaStackV3('alphastack-container', {
  autoRefresh: true,
  refreshInterval: 30000,
  maxDisplayItems: 50
});

// Listen for events
document.addEventListener('alphastack:candidateSelect', (event) => {
  const { candidate } = event.detail;
  executeBuy100(candidate.ticker, candidate.price);
});
```

### HTML Integration (CDN)
```html
<!-- Include React 18+ -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Include integration bridge -->
<script src="/src/integration/AlphaStackV3Integration.js"></script>

<!-- Container -->
<div id="alphastack-v3-container"></div>
```

## 🎛️ Configuration

### Feature Flags
Control component behavior via environment variables:

```bash
# Core V3 Features
ALPHASTACK_V3_ENABLED=true          # Enable V3 component
V3_PERFORMANCE_MODE=true            # Max performance optimizations
V3_REAL_TIME_UPDATES=true           # Enable live data updates

# UI Features
V3_DENSE_LAYOUT=true                # Compact professional layout
V3_MOBILE_OPTIMIZATION=true         # Mobile-first responsive
V3_DARK_THEME=true                  # Dark theme (default)

# Performance Features
V3_API_CACHING=true                 # Enable intelligent caching
V3_ERROR_BOUNDARIES=true            # Error boundary protection
V3_GRACEFUL_DEGRADATION=true        # Fallback behavior

# Safety Features (Production)
ALPHASTACK_PROTECTION=true          # Always enabled - read-only mode
READ_ONLY_MODE=true                 # Prevents modifications
CIRCUIT_BREAKER=true                # API failure protection

# Development
V3_DEBUG=true                       # Debug logging
V3_PERF_MONITOR=true                # Performance metrics
V3_API_LOGGING=true                 # API request logging
```

### Component Props
```typescript
interface AlphaStackV3Props {
  className?: string;              // CSS classes
  autoRefresh?: boolean;           // Auto-refresh data (default: true)
  refreshInterval?: number;        // Refresh interval in ms (default: 30000)
  maxDisplayItems?: number;        // Max items to display (default: 50)
  onCandidateSelect?: (candidate: AlphaStackCandidate) => void;
  onError?: (error: Error) => void;
  onDataLoad?: (data: AlphaStackCandidate[], stats: AlphaStackStats) => void;
}
```

## 📊 Performance Monitoring

### Built-in Metrics
- **Load Time**: Initial component load duration
- **Render Time**: Component render duration
- **Update Time**: Data refresh duration
- **API Response Time**: Network request duration
- **Error Count**: Failed request tracking

### Monitoring Hook
```typescript
import { usePerformanceMetrics } from '../hooks/useAlphaStackData';

function MyComponent() {
  const { metrics, startRenderTimer } = usePerformanceMetrics();
  
  useEffect(() => {
    const endTimer = startRenderTimer();
    return endTimer; // Automatically tracks render time
  }, []);
  
  return <div>Load time: {metrics.loadTime}ms</div>;
}
```

### Analytics Integration
```typescript
// Custom analytics tracking
document.addEventListener('alphastack:dataLoad', (event) => {
  analytics.track('alphastack_data_load', {
    candidateCount: event.detail.data.length,
    avgScore: event.detail.stats.avgScore,
    loadTime: event.detail.performance?.loadTime
  });
});
```

## 🔒 Security & Protection

### AlphaStack Protection
- **Immutable Discovery Engine** - cannot modify `agents/universe_screener.py`
- **Read-only API Access** - only consumes data, never modifies
- **Protected Endpoints** - restricted to approved endpoints
- **Feature Flag Guards** - instant disable capability

### Error Boundaries
- **Component-level** error boundaries prevent crashes
- **Graceful degradation** to V2 fallback
- **Error reporting** for monitoring and debugging
- **Recovery mechanisms** with retry functionality

### Data Validation
- **TypeScript interfaces** ensure data structure integrity
- **Runtime validation** for API responses
- **Sanitization** of user inputs and display data
- **XSS protection** through React's built-in escaping

## 🧪 Testing

### Performance Testing
```bash
# Load time testing
curl -w "@curl-format.txt" http://localhost:3003/api/v2/scan/squeeze

# Memory leak detection
node --inspect scripts/memory-test.js

# Bundle size analysis
npx webpack-bundle-analyzer build/static/js/*.js
```

### Component Testing
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { AlphaStackV3 } from './AlphaStackV3';

test('loads candidates within 2 seconds', async () => {
  const start = performance.now();
  render(<AlphaStackV3 />);
  
  await waitFor(() => {
    expect(screen.getByText(/candidates/)).toBeInTheDocument();
  });
  
  const loadTime = performance.now() - start;
  expect(loadTime).toBeLessThan(2000);
});
```

## 🚨 Troubleshooting

### Common Issues

**Component doesn't load**
- Check React/ReactDOM versions (requires 18+)
- Verify feature flags: `ALPHASTACK_V3_ENABLED=true`
- Check browser console for JavaScript errors

**Slow performance**
- Enable performance mode: `V3_PERFORMANCE_MODE=true`
- Reduce refresh interval: `refreshInterval={60000}`
- Limit display items: `maxDisplayItems={25}`

**API errors**
- Verify `/api/v2/scan/squeeze` endpoint is accessible
- Check network connectivity and CORS settings
- Review server logs for backend issues

**Memory leaks**
- Ensure proper component unmounting
- Check for uncleaned event listeners
- Monitor memory usage in dev tools

### Debug Mode
```javascript
// Enable debug logging
localStorage.setItem('alphastack:debug', 'true');

// View performance metrics
console.log(window.alphaStackIntegration.performanceMetrics);

// Check feature flags
console.log(window.featureFlags.getConfig());
```

## 🛣️ Roadmap

### V3.1 (Next Release)
- [ ] Virtual scrolling for 1000+ items
- [ ] WebSocket real-time updates
- [ ] Advanced filtering and sorting
- [ ] Customizable layouts

### V3.2 (Future)
- [ ] PWA offline capability
- [ ] Chart integration
- [ ] AI-powered recommendations
- [ ] Multi-language support

## 📄 License

This component is part of the Trading Intelligence System and follows the project's licensing terms.

---

**Built with ❤️ for financial professionals who demand speed and reliability.**