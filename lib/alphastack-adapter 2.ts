export interface Contender {
  ticker: string;
  score: number;
  price: number;
  action: string;
  confidence: number;
  engine?: string;
  run_id?: string;
  snapshot_ts?: string;
}

export interface OrderRequest {
  ticker: string;
  notional: number;
  tp: number;
  tp2: number;
  sl: number;
  idempotencyKey: string;
}

export interface OrderResponse {
  ok: boolean;
  order_id?: string;
  status?: string;
  filled_avg_price?: number;
  error?: string;
}

export interface PortfolioRecord {
  engine: string;
  run_id: string;
  snapshot_ts: string;
  ticker: string;
  order_id: string;
  notional_usd: number;
  tp1: number;
  tp2: number;
  sl: number;
}

export interface Position {
  ticker: string;
  qty: number;
  avg_cost: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

export interface Config {
  discoveryUrl: string;
  alpacaProxyUrl: string;
  portfolioUrl?: string;
  mockIfMissing?: boolean;
}

export class AlphaStack {
  private config: Config;

  constructor(config: Config) {
    this.config = {
      mockIfMissing: true,
      ...config
    };
  }

  async getContenders(limit = 6): Promise<Contender[]> {
    try {
      const response = await fetch(
        `${this.config.discoveryUrl}/api/discovery/contenders?limit=${limit}`
      );
      
      if (!response.ok) {
        throw new Error(`Discovery API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.items || data.contenders || [];
    } catch (error) {
      console.error('Failed to fetch contenders:', error);
      if (this.config.mockIfMissing) {
        return this.mockContenders(limit);
      }
      throw error;
    }
  }

  async placeBuyAndRecord({
    ticker,
    notionalUsd,
    tp1 = 0.20,
    tp2 = 0.50,
    sl = 0.10,
    engine = 'alphastack',
    run_id = `run_${Date.now()}`,
    snapshot_ts = new Date().toISOString(),
    idempotencyKey = `${ticker}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }: {
    ticker: string;
    notionalUsd: number;
    tp1?: number;
    tp2?: number;
    sl?: number;
    engine?: string;
    run_id?: string;
    snapshot_ts?: string;
    idempotencyKey?: string;
  }): Promise<{ order: OrderResponse; portfolio: any }> {
    
    // Place order via Alpaca proxy
    const orderRequest: OrderRequest = {
      ticker,
      notional: notionalUsd,
      tp: tp1,
      tp2,
      sl,
      idempotencyKey
    };

    try {
      const orderResponse = await fetch(`${this.config.alpacaProxyUrl}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderRequest)
      });

      const order: OrderResponse = await orderResponse.json();

      if (!order.ok) {
        throw new Error(`Order failed: ${order.error}`);
      }

      // Create portfolio record
      let portfolioResult = null;
      if (this.config.portfolioUrl && order.order_id) {
        const portfolioRecord: PortfolioRecord = {
          engine,
          run_id,
          snapshot_ts,
          ticker,
          order_id: order.order_id,
          notional_usd: notionalUsd,
          tp1,
          tp2,
          sl
        };

        try {
          const portfolioResponse = await fetch(`${this.config.portfolioUrl}/api/portfolio/positions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(portfolioRecord)
          });

          portfolioResult = await portfolioResponse.json();
        } catch (portfolioError) {
          console.warn('Portfolio recording failed:', portfolioError);
          if (this.config.mockIfMissing) {
            portfolioResult = { success: true, mock: true };
          }
        }
      } else if (this.config.mockIfMissing) {
        portfolioResult = { success: true, mock: true };
      }

      return { order, portfolio: portfolioResult };
    } catch (error) {
      console.error('Order placement failed:', error);
      if (this.config.mockIfMissing) {
        return {
          order: { ok: true, order_id: `mock_${idempotencyKey}`, status: 'filled' },
          portfolio: { success: true, mock: true }
        };
      }
      throw error;
    }
  }

  async getPositions(): Promise<Position[]> {
    if (!this.config.portfolioUrl) {
      return this.config.mockIfMissing ? this.mockPositions() : [];
    }

    try {
      const response = await fetch(`${this.config.portfolioUrl}/api/portfolio/positions`);
      const data = await response.json();
      return data.positions || data || [];
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      return this.config.mockIfMissing ? this.mockPositions() : [];
    }
  }

  async upsertFill({
    order_id,
    ticker,
    qty,
    avg_cost,
    filled_at = new Date().toISOString()
  }: {
    order_id: string;
    ticker: string;
    qty: number;
    avg_cost: number;
    filled_at?: string;
  }): Promise<any> {
    if (!this.config.portfolioUrl) {
      return this.config.mockIfMissing ? { success: true, mock: true } : null;
    }

    try {
      const response = await fetch(`${this.config.portfolioUrl}/api/portfolio/fills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id, ticker, qty, avg_cost, filled_at })
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to upsert fill:', error);
      return this.config.mockIfMissing ? { success: true, mock: true } : null;
    }
  }

  private mockContenders(limit: number): Contender[] {
    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN'];
    return tickers.slice(0, limit).map((ticker, i) => ({
      ticker,
      score: 75 + Math.random() * 20,
      price: 100 + Math.random() * 200,
      action: 'BUY',
      confidence: 80 + Math.random() * 15,
      engine: 'alphastack',
      run_id: `mock_run_${Date.now()}`,
      snapshot_ts: new Date().toISOString()
    }));
  }

  private mockPositions(): Position[] {
    return [
      {
        ticker: 'AAPL',
        qty: 10,
        avg_cost: 150.00,
        market_value: 1520.00,
        unrealized_pnl: 20.00,
        unrealized_pnl_pct: 1.33
      }
    ];
  }
}

// Default instance with environment config
export const alphaStack = new AlphaStack({
  discoveryUrl: process.env.NEXT_PUBLIC_DISCOVERY_URL || process.env.DISCOVERY_URL || 'http://localhost:3003',
  alpacaProxyUrl: process.env.NEXT_PUBLIC_ALPACA_PROXY_URL || process.env.ALPACA_PROXY_URL || 'http://localhost:5001',
  portfolioUrl: process.env.NEXT_PUBLIC_PORTFOLIO_URL || process.env.PORTFOLIO_URL || undefined,
  mockIfMissing: true
});