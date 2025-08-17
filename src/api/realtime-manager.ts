/**
 * Real-time Data Manager
 * WebSocket optimization, intelligent polling, and background refresh management
 */

import type { AlphaStackResponse, AlphaStackCandidate } from '../types/alphastack';
import { isEnabled } from '../config/feature-flags';
import { alphaStackClient } from './alphastack-client';
import { errorHandler } from './error-handler';
import { performanceMonitor } from './performance-monitor';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type UpdateStrategy = 'polling' | 'websocket' | 'hybrid';

export interface RealTimeConfig {
  strategy: UpdateStrategy;
  pollingInterval: number;
  maxPollingInterval: number;
  backoffMultiplier: number;
  websocketUrl?: string;
  enableBackgroundRefresh: boolean;
  visibilityOptimization: boolean;
  bandwidthOptimization: boolean;
}

export interface DataUpdate {
  data: AlphaStackCandidate[];
  timestamp: Date;
  source: 'poll' | 'websocket' | 'background';
  isIncremental: boolean;
  changeCount: number;
}

export interface ConnectionMetrics {
  state: ConnectionState;
  lastUpdate: Date | null;
  updateCount: number;
  errorCount: number;
  averageLatency: number;
  bandwidthUsed: number; // bytes
}

interface PollingState {
  interval: number;
  timeoutId: NodeJS.Timeout | null;
  consecutiveErrors: number;
  lastSuccessfulUpdate: number;
}

interface WebSocketState {
  connection: WebSocket | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
}

interface BackgroundRefreshState {
  enabled: boolean;
  worker: Worker | null;
  lastRefresh: number;
  refreshInterval: number;
}

export class RealTimeDataManager {
  private config: RealTimeConfig;
  private connectionState: ConnectionState = 'disconnected';
  private pollingState: PollingState;
  private websocketState: WebSocketState;
  private backgroundState: BackgroundRefreshState;
  private metrics: ConnectionMetrics;
  private updateCallbacks = new Set<(update: DataUpdate) => void>();
  private stateChangeCallbacks = new Set<(state: ConnectionState) => void>();
  private lastData: AlphaStackCandidate[] = [];
  private isVisible = true;
  private bandwidthTracker = {
    bytesReceived: 0,
    lastReset: Date.now()
  };

  constructor(config?: Partial<RealTimeConfig>) {
    this.config = {
      strategy: 'polling',
      pollingInterval: 30000, // 30 seconds default
      maxPollingInterval: 300000, // 5 minutes max
      backoffMultiplier: 2,
      enableBackgroundRefresh: true,
      visibilityOptimization: true,
      bandwidthOptimization: true,
      ...config
    };

    this.pollingState = {
      interval: this.config.pollingInterval,
      timeoutId: null,
      consecutiveErrors: 0,
      lastSuccessfulUpdate: 0
    };

    this.websocketState = {
      connection: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000
    };

    this.backgroundState = {
      enabled: this.config.enableBackgroundRefresh,
      worker: null,
      lastRefresh: 0,
      refreshInterval: 60000 // 1 minute background refresh
    };

    this.metrics = {
      state: 'disconnected',
      lastUpdate: null,
      updateCount: 0,
      errorCount: 0,
      averageLatency: 0,
      bandwidthUsed: 0
    };

    this.initializeVisibilityTracking();
    this.initializeBackgroundRefresh();
  }

  /**
   * Start real-time data updates
   */
  async start(): Promise<void> {
    if (this.connectionState !== 'disconnected') {
      console.warn('RealTimeDataManager already started');
      return;
    }

    this.setConnectionState('connecting');

    try {
      switch (this.config.strategy) {
        case 'websocket':
          await this.startWebSocket();
          break;
        case 'polling':
          await this.startPolling();
          break;
        case 'hybrid':
          await this.startHybrid();
          break;
      }

      this.setConnectionState('connected');
      
      if (isEnabled('DEBUG_MODE')) {
        console.log(`🔄 RealTimeDataManager started with ${this.config.strategy} strategy`);
      }

    } catch (error) {
      this.setConnectionState('error');
      console.error('❌ Failed to start RealTimeDataManager:', error);
      throw error;
    }
  }

  /**
   * Stop real-time data updates
   */
  async stop(): Promise<void> {
    this.setConnectionState('disconnected');

    // Stop polling
    if (this.pollingState.timeoutId) {
      clearTimeout(this.pollingState.timeoutId);
      this.pollingState.timeoutId = null;
    }

    // Close WebSocket
    if (this.websocketState.connection) {
      this.websocketState.connection.close();
      this.websocketState.connection = null;
    }

    // Stop background worker
    if (this.backgroundState.worker) {
      this.backgroundState.worker.terminate();
      this.backgroundState.worker = null;
    }

    if (isEnabled('DEBUG_MODE')) {
      console.log('🛑 RealTimeDataManager stopped');
    }
  }

  private async startPolling(): Promise<void> {
    const poll = async () => {
      if (this.connectionState === 'disconnected') return;

      // Skip polling if tab is hidden and optimization is enabled
      if (!this.isVisible && this.config.visibilityOptimization) {
        this.scheduleNextPoll();
        return;
      }

      const startTime = performance.now();

      try {
        const response = await alphaStackClient.fetchSqueezeData({
          useCache: true,
          timeout: 10000
        });

        const latency = performance.now() - startTime;
        this.updateMetrics(latency, response);

        const changeCount = this.calculateChangeCount(response.results || []);
        const update: DataUpdate = {
          data: response.results || [],
          timestamp: new Date(),
          source: 'poll',
          isIncremental: false,
          changeCount
        };

        this.notifyUpdateCallbacks(update);
        this.lastData = response.results || [];
        this.pollingState.consecutiveErrors = 0;
        this.pollingState.lastSuccessfulUpdate = Date.now();
        
        // Reset polling interval on success
        this.pollingState.interval = this.config.pollingInterval;

      } catch (error) {
        this.pollingState.consecutiveErrors++;
        this.metrics.errorCount++;

        const { recovery } = await errorHandler.handleError(error as Error, {
          endpoint: '/api/v2/scan/squeeze',
          metadata: { source: 'polling' }
        });

        if (recovery && recovery.results) {
          const update: DataUpdate = {
            data: recovery.results,
            timestamp: new Date(),
            source: 'poll',
            isIncremental: false,
            changeCount: 0
          };
          this.notifyUpdateCallbacks(update);
        }

        // Implement exponential backoff
        this.pollingState.interval = Math.min(
          this.pollingState.interval * this.config.backoffMultiplier,
          this.config.maxPollingInterval
        );

        if (isEnabled('DEBUG_MODE')) {
          console.warn(`⚠️ Polling error, backing off to ${this.pollingState.interval}ms:`, error);
        }
      }

      this.scheduleNextPoll();
    };

    // Start first poll immediately
    poll();
  }

  private scheduleNextPoll(): void {
    if (this.connectionState === 'disconnected') return;

    this.pollingState.timeoutId = setTimeout(() => {
      if (this.connectionState === 'connected') {
        this.startPolling();
      }
    }, this.pollingState.interval);
  }

  private async startWebSocket(): Promise<void> {
    if (!this.config.websocketUrl) {
      throw new Error('WebSocket URL not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.config.websocketUrl!);
        
        ws.onopen = () => {
          this.websocketState.connection = ws;
          this.websocketState.reconnectAttempts = 0;
          resolve();
        };

        ws.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        ws.onclose = () => {
          this.handleWebSocketClose();
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.metrics.errorCount++;
          if (this.connectionState === 'connecting') {
            reject(new Error('WebSocket connection failed'));
          }
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const startTime = performance.now();
      const data = JSON.parse(event.data);
      
      if (data.type === 'squeeze_update' && data.payload) {
        const latency = performance.now() - startTime;
        this.updateMetrics(latency, data.payload);

        const changeCount = this.calculateChangeCount(data.payload.results || []);
        const update: DataUpdate = {
          data: data.payload.results || [],
          timestamp: new Date(data.payload.asof),
          source: 'websocket',
          isIncremental: data.isIncremental || false,
          changeCount
        };

        this.notifyUpdateCallbacks(update);
        this.lastData = data.payload.results || [];
      }

      // Track bandwidth
      this.bandwidthTracker.bytesReceived += event.data.length;

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.metrics.errorCount++;
    }
  }

  private handleWebSocketClose(): void {
    this.websocketState.connection = null;

    if (this.connectionState === 'connected') {
      // Attempt reconnection
      this.attemptWebSocketReconnect();
    }
  }

  private async attemptWebSocketReconnect(): Promise<void> {
    if (this.websocketState.reconnectAttempts >= this.websocketState.maxReconnectAttempts) {
      console.error('❌ Max WebSocket reconnection attempts reached, falling back to polling');
      this.config.strategy = 'polling';
      await this.startPolling();
      return;
    }

    this.websocketState.reconnectAttempts++;
    const delay = this.websocketState.reconnectDelay * this.websocketState.reconnectAttempts;

    setTimeout(async () => {
      try {
        await this.startWebSocket();
      } catch (error) {
        console.warn(`⚠️ WebSocket reconnection attempt ${this.websocketState.reconnectAttempts} failed:`, error);
        this.attemptWebSocketReconnect();
      }
    }, delay);
  }

  private async startHybrid(): Promise<void> {
    // Try WebSocket first, fall back to polling
    try {
      await this.startWebSocket();
      console.log('🔌 Hybrid mode: Using WebSocket');
    } catch (error) {
      console.warn('⚠️ WebSocket failed in hybrid mode, using polling:', error);
      await this.startPolling();
    }
  }

  private initializeVisibilityTracking(): void {
    if (!this.config.visibilityOptimization || typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      this.isVisible = !document.hidden;
      
      if (this.isVisible) {
        // Page became visible, trigger immediate update if data is stale
        const staleDuration = Date.now() - this.pollingState.lastSuccessfulUpdate;
        if (staleDuration > this.config.pollingInterval * 1.5) {
          this.triggerImmediateUpdate();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  private initializeBackgroundRefresh(): void {
    if (!this.backgroundState.enabled || typeof Worker === 'undefined') {
      return;
    }

    // Background refresh logic would use a Web Worker for non-blocking updates
    // This is a simplified implementation
    setInterval(() => {
      if (!this.isVisible && this.connectionState === 'connected') {
        this.triggerBackgroundRefresh();
      }
    }, this.backgroundState.refreshInterval);
  }

  private async triggerImmediateUpdate(): Promise<void> {
    if (this.connectionState !== 'connected') return;

    try {
      const response = await alphaStackClient.fetchSqueezeData({
        useCache: false,
        timeout: 5000
      });

      const update: DataUpdate = {
        data: response.results || [],
        timestamp: new Date(),
        source: 'poll',
        isIncremental: false,
        changeCount: this.calculateChangeCount(response.results || [])
      };

      this.notifyUpdateCallbacks(update);
      this.lastData = response.results || [];

    } catch (error) {
      console.warn('⚠️ Immediate update failed:', error);
    }
  }

  private async triggerBackgroundRefresh(): Promise<void> {
    if (Date.now() - this.backgroundState.lastRefresh < this.backgroundState.refreshInterval) {
      return;
    }

    this.backgroundState.lastRefresh = Date.now();

    try {
      const response = await alphaStackClient.fetchSqueezeData({
        useCache: true,
        timeout: 30000
      });

      // Store in cache but don't update UI (background refresh)
      if (response.results) {
        errorHandler.storeFallbackData(response.results);
      }

      if (isEnabled('DEBUG_MODE')) {
        console.log('🔄 Background refresh completed');
      }

    } catch (error) {
      console.warn('⚠️ Background refresh failed:', error);
    }
  }

  private calculateChangeCount(newData: AlphaStackCandidate[]): number {
    if (this.lastData.length === 0) return newData.length;

    const oldTickers = new Set(this.lastData.map(item => item.ticker));
    const newTickers = new Set(newData.map(item => item.ticker));
    
    let changes = 0;

    // Count additions
    newTickers.forEach(ticker => {
      if (!oldTickers.has(ticker)) changes++;
    });

    // Count removals
    oldTickers.forEach(ticker => {
      if (!newTickers.has(ticker)) changes++;
    });

    // Count modifications (simplified - just check score changes)
    const oldByTicker = new Map(this.lastData.map(item => [item.ticker, item]));
    newData.forEach(newItem => {
      const oldItem = oldByTicker.get(newItem.ticker);
      if (oldItem && Math.abs(oldItem.score - newItem.score) > 1) {
        changes++;
      }
    });

    return changes;
  }

  private updateMetrics(latency: number, response: AlphaStackResponse): void {
    this.metrics.updateCount++;
    this.metrics.lastUpdate = new Date();
    
    // Update average latency
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency = (this.metrics.averageLatency * 0.8) + (latency * 0.2);
    }

    // Track bandwidth
    const dataSize = JSON.stringify(response).length;
    this.bandwidthTracker.bytesReceived += dataSize;
    
    // Reset bandwidth counter every hour
    if (Date.now() - this.bandwidthTracker.lastReset > 3600000) {
      this.metrics.bandwidthUsed = this.bandwidthTracker.bytesReceived;
      this.bandwidthTracker.bytesReceived = 0;
      this.bandwidthTracker.lastReset = Date.now();
    }

    // Record performance metrics
    performanceMonitor.recordApiRequest(
      latency,
      !response.error,
      '/api/v2/scan/squeeze',
      response.source === 'cache'
    );
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;

    this.connectionState = state;
    this.metrics.state = state;
    
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }

  private notifyUpdateCallbacks(update: DataUpdate): void {
    this.updateCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('Error in update callback:', error);
      }
    });
  }

  /**
   * Subscribe to data updates
   */
  onUpdate(callback: (update: DataUpdate) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Subscribe to connection state changes
   */
  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
  }

  /**
   * Get current connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RealTimeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Apply changes that affect active connections
    if (newConfig.pollingInterval && this.config.strategy === 'polling') {
      this.pollingState.interval = newConfig.pollingInterval;
    }
  }

  /**
   * Force immediate data refresh
   */
  async refresh(): Promise<void> {
    await this.triggerImmediateUpdate();
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Reset all metrics and state
   */
  reset(): void {
    this.metrics = {
      state: this.connectionState,
      lastUpdate: null,
      updateCount: 0,
      errorCount: 0,
      averageLatency: 0,
      bandwidthUsed: 0
    };
    
    this.bandwidthTracker = {
      bytesReceived: 0,
      lastReset: Date.now()
    };
  }
}

// Factory function for creating configured instances
export function createRealTimeManager(config?: Partial<RealTimeConfig>): RealTimeDataManager {
  return new RealTimeDataManager(config);
}

// Default instance with standard configuration
export const realTimeManager = createRealTimeManager({
  strategy: isEnabled('V3_REAL_TIME_UPDATES') ? 'polling' : 'polling',
  pollingInterval: 30000,
  enableBackgroundRefresh: isEnabled('V3_PERFORMANCE_MODE'),
  visibilityOptimization: true,
  bandwidthOptimization: true
});