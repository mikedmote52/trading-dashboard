/**
 * Schema Adapter Utilities
 * 
 * Safe type conversion helpers for normalizing disparate data sources
 * into the canonical DiscoveryV1 schema
 */

// Safe number conversion with default fallback
export const nz = (x: any, defaultValue: number = 0): number => {
  if (x === null || x === undefined) return defaultValue;
  const num = Number(x);
  return Number.isFinite(num) ? num : defaultValue;
};

// Safe positive number with null fallback
export const nzPositive = (x: any): number | null => {
  if (x === null || x === undefined) return null;
  const num = Number(x);
  return Number.isFinite(num) && num > 0 ? num : null;
};

// Safe percentage (0-100) conversion
export const nzPercent = (x: any): number | null => {
  if (x === null || x === undefined) return null;
  const num = Number(x);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, num));
};

// Convert various boolean-ish values to confidence
export const toConfidence = (enrichedOk?: boolean | string | number): "low" | "high" => {
  if (typeof enrichedOk === "boolean") return enrichedOk ? "high" : "low";
  if (typeof enrichedOk === "string") return enrichedOk.toLowerCase() === "true" || enrichedOk === "high" ? "high" : "low";
  if (typeof enrichedOk === "number") return enrichedOk > 0 ? "high" : "low";
  return "low";
};

// Safe string extraction
export const safeString = (x: any, maxLength: number = 500): string | null => {
  if (x === null || x === undefined) return null;
  const str = String(x).trim();
  return str.length > 0 ? str.substring(0, maxLength) : null;
};

// Safe array extraction
export const safeStringArray = (x: any): string[] => {
  if (Array.isArray(x)) {
    return x.map(item => String(item).trim()).filter(s => s.length > 0);
  }
  if (typeof x === "string" && x.trim()) {
    return [x.trim()];
  }
  return [];
};

// Extract ticker from various formats
export const extractTicker = (item: any): string => {
  const ticker = item.ticker || item.symbol || item.Symbol || item.TICKER;
  if (typeof ticker === "string" && ticker.trim()) {
    return ticker.trim().toUpperCase();
  }
  throw new Error(`Invalid ticker: ${JSON.stringify(ticker)}`);
};

// Score normalization (force into 0-100 range)
export const normalizeScore = (x: any, defaultScore: number = 60): number => {
  const score = nz(x, defaultScore);
  return Math.max(0, Math.min(100, score));
};

// Safe metadata object extraction
export const extractMeta = (item: any, excludeKeys: string[] = []): Record<string, any> => {
  const meta: Record<string, any> = {};
  
  if (typeof item === "object" && item !== null) {
    Object.keys(item).forEach(key => {
      if (!excludeKeys.includes(key) && item[key] !== undefined) {
        try {
          // Serialize complex objects safely
          if (typeof item[key] === "object") {
            meta[key] = JSON.parse(JSON.stringify(item[key]));
          } else {
            meta[key] = item[key];
          }
        } catch (err) {
          // Skip problematic keys
        }
      }
    });
  }
  
  return meta;
};