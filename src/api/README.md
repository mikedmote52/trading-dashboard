# Enhanced AlphaStack API System

## Overview

The Enhanced AlphaStack API System provides fault-tolerant data fetching, comprehensive error handling, performance monitoring, and real-time updates for the AlphaStack V3 trading dashboard. This system is designed to maintain high availability and performance while protecting the immutable discovery engine.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AlphaStack V3 UI                         │
├─────────────────────────────────────────────────────────────┤
│                Enhanced Hooks Layer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │useEnhancedAlpha-│ │useAlphaStack-   │ │useAlphaStack-   ││
│  │StackData        │ │Health           │ │Alerts           ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                    API Client Layer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │AlphaStack       │ │RealTime         │ │Performance      ││
│  │Client           │ │Manager          │ │Monitor          ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
│  ┌─────────────────┐ ┌─────────────────┐                   │
│  │Error            │ │Circuit          │                   │
│  │Handler          │ │Breaker          │                   │
│  └─────────────────┘ └─────────────────┘                   │
├─────────────────────────────────────────────────────────────┤
│                Protected Discovery Layer                    │
│                     (READ-ONLY)                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │     /api/v2/scan/squeeze (AlphaStack Engine)            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. AlphaStack Client (`alphastack-client.ts`)

**Features:**
- Circuit breaker pattern with configurable thresholds
- Exponential backoff with jitter for retries
- Request deduplication to prevent duplicate calls
- Intelligent caching with stale-while-revalidate
- Response validation and sanitization
- Health check endpoint integration

**Usage:**
```typescript
import { alphaStackClient } from './api';

const response = await alphaStackClient.fetchSqueezeData({
  useCache: true,
  timeout: 15000,
  retryOptions: {
    maxAttempts: 3,
    baseDelay: 1000,
    exponentialBase: 2
  }
});
```

### 2. Error Handler (`error-handler.ts`)

**Features:**
- Comprehensive error classification by type and severity
- Multiple recovery strategies with priority ordering
- Graceful degradation with fallback data
- User-friendly error messaging
- Error analytics and trending

**Error Types:**
- `NETWORK`: Connection issues
- `TIMEOUT`: Request timeouts
- `API_ERROR`: Server errors (4xx/5xx)
- `VALIDATION`: Data validation failures
- `CIRCUIT_BREAKER`: Circuit breaker activation
- `UNKNOWN`: Unclassified errors

**Recovery Strategies:**
1. **Cached Data Recovery** (Priority 1): Use stored fallback data
2. **Degraded Service** (Priority 2): Simplified response structure
3. **Emergency Mock** (Priority 3): Basic fallback data for UI stability

### 3. Performance Monitor (`performance-monitor.ts`)

**Features:**
- Real-time performance tracking
- Configurable threshold alerting
- Trend analysis (improving/degrading/stable)
- Health score calculation (0-100)
- Metric export for analysis

**Tracked Metrics:**
- API response time (avg, min, max, p95, p99)
- Success/error rates
- Cache hit rates
- Data freshness
- Memory usage
- Request counts

**Thresholds (default):**
- Response Time: Warning >2s, Critical >5s
- Error Rate: Warning >5%, Critical >15%
- Success Rate: Warning <95%, Critical <85%

### 4. Real-Time Manager (`realtime-manager.ts`)

**Features:**
- Multiple update strategies (polling, WebSocket, hybrid)
- Intelligent polling with exponential backoff
- Visibility optimization (pause when tab hidden)
- Background refresh for cache warming
- Bandwidth optimization
- Connection state management

**Update Strategies:**
- **Polling**: Traditional HTTP polling with smart intervals
- **WebSocket**: Real-time updates via WebSocket connection
- **Hybrid**: WebSocket with polling fallback

## Enhanced Hooks

### useEnhancedAlphaStackData

The primary hook for consuming AlphaStack data with full fault tolerance:

```typescript
import { useEnhancedAlphaStackData } from './hooks/useEnhancedAlphaStackData';

const {
  data,
  loading,
  error,
  connectionState,
  healthScore,
  performanceMetrics,
  retry,
  resetConnection,
  systemStatus
} = useEnhancedAlphaStackData({
  autoRefresh: true,
  refreshInterval: 30000,
  realTimeUpdates: true,
  errorRecovery: true,
  performanceTracking: true
});
```

### useAlphaStackHealth

Monitor overall system health:

```typescript
import { useAlphaStackHealth } from './hooks/useEnhancedAlphaStackData';

const { score, status, metrics } = useAlphaStackHealth();
```

### useAlphaStackAlerts

Handle performance alerts:

```typescript
import { useAlphaStackAlerts } from './hooks/useEnhancedAlphaStackData';

const { alerts, dismissAlert } = useAlphaStackAlerts();
```

## Configuration

### Feature Flags

The system integrates with the existing feature flag system:

```javascript
// src/config/feature-flags.js
V3_API_CACHING: true,           // Enable intelligent caching
V3_ERROR_BOUNDARIES: true,      // Enable error recovery
V3_REAL_TIME_UPDATES: true,     // Enable real-time updates
PERFORMANCE_MONITORING: true,   // Enable performance tracking
CIRCUIT_BREAKER: true,          // Enable circuit breaker
```

### Environment Variables

```bash
# Performance tuning
V2_REFRESH_MS=30000              # Background refresh interval
V2_CACHE_TTL_MS=30000           # Cache TTL
ALPHASTACK_DEBUG=1              # Debug logging

# Real-time configuration
V3_REAL_TIME_UPDATES=true       # Enable real-time updates
V3_PERFORMANCE_MODE=true        # Enable performance optimizations
```

## Performance Targets

- **Response Time**: <100ms from API to UI update
- **Cache Hit Rate**: >80% for repeated requests
- **Error Recovery**: <3 retries with exponential backoff
- **Availability**: 99.9% uptime with graceful degradation
- **Memory Usage**: <50MB additional overhead

## Security & Protection

### AlphaStack Discovery Protection

- **Read-only access** to discovery endpoints
- **No modifications** to discovery algorithms
- **One-way data flow** from AlphaStack to UI
- **Immutable discovery engine** protection

### Circuit Breaker Configuration

```typescript
{
  failureThreshold: 5,      // Open after 5 failures
  timeout: 30000,           // Request timeout (30s)
  resetTimeout: 60000       // Reset attempt after 1 minute
}
```

## Integration Guide

### Quick Setup

```typescript
import { setupAlphaStackAPI } from './api';

// Initialize the enhanced API system
const apiSystem = setupAlphaStackAPI({
  enableRealTime: true,
  enablePerformanceMonitoring: true,
  enableErrorRecovery: true,
  pollingInterval: 30000
});
```

### Component Integration

```typescript
import React from 'react';
import { useEnhancedAlphaStackData } from './hooks/useEnhancedAlphaStackData';

export const AlphaStackDashboard: React.FC = () => {
  const {
    data,
    loading,
    error,
    healthScore,
    retry,
    systemStatus
  } = useEnhancedAlphaStackData({
    autoRefresh: true,
    realTimeUpdates: true,
    errorRecovery: true
  });

  if (loading) return <LoadingIndicator />;
  if (error && systemStatus.status === 'unhealthy') {
    return <ErrorBoundary onRetry={retry} />;
  }

  return (
    <div>
      <HealthIndicator score={healthScore} />
      <CandidateList candidates={data} />
    </div>
  );
};
```

## Monitoring & Debugging

### Health Check

```typescript
import { healthCheck } from './api';

const health = await healthCheck();
console.log('System Health:', health.status);
console.log('Components:', health.components);
```

### Performance Export

```typescript
import { performanceMonitor } from './api';

const performanceData = performanceMonitor.exportData();
// Send to analytics service or download for analysis
```

### Emergency Reset

```typescript
import { emergencyReset } from './api';

// In case of critical system issues
await emergencyReset();
```

## Error Handling Best Practices

### Component Level

```typescript
const handleError = useCallback((error: Error) => {
  // Log error for debugging
  console.error('AlphaStack Error:', error);
  
  // Show user-friendly message
  showNotification(error.message, 'error');
  
  // Attempt automatic recovery
  setTimeout(() => retry(), 5000);
}, [retry]);
```

### Global Level

```typescript
// Set up global error boundary
errorHandler.onAlert((alert) => {
  if (alert.level === 'critical') {
    // Notify operations team
    sendAlert(alert);
  }
});
```

## Testing

### Unit Tests

```typescript
import { alphaStackClient } from './api/alphastack-client';

describe('AlphaStackClient', () => {
  it('should handle network errors gracefully', async () => {
    // Mock network failure
    fetch.mockRejectedValue(new Error('Network error'));
    
    const result = await alphaStackClient.fetchSqueezeData({
      useCache: true,
      retryOptions: { maxAttempts: 1 }
    });
    
    // Should return cached/fallback data
    expect(result.source).toBe('fallback-cache');
  });
});
```

### Integration Tests

```typescript
import { healthCheck } from './api';

describe('System Health', () => {
  it('should report healthy status', async () => {
    const health = await healthCheck();
    expect(health.status).toBeOneOf(['healthy', 'degraded']);
  });
});
```

## Troubleshooting

### Common Issues

1. **High Error Rate**
   - Check network connectivity
   - Verify API endpoint availability
   - Review circuit breaker thresholds

2. **Poor Performance**
   - Enable performance monitoring
   - Check cache hit rates
   - Review polling intervals

3. **Connection Issues**
   - Verify WebSocket configuration
   - Check firewall/proxy settings
   - Fall back to polling mode

### Debug Commands

```typescript
// Check system status
const status = await healthCheck();

// Export performance data
const metrics = performanceMonitor.exportData();

// Reset system state
await emergencyReset();
```

## Backward Compatibility

The enhanced system maintains full backward compatibility with the existing `useAlphaStackData` hook. Existing components will continue to work without modification while gaining the benefits of enhanced error handling and performance monitoring in the background.

## Future Enhancements

- WebSocket server implementation for true real-time updates
- Advanced caching strategies (Redis integration)
- Machine learning-based performance optimization
- Advanced analytics and reporting dashboard
- Mobile-specific optimizations