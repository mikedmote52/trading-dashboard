/**
 * Canonical Discovery Schema V1
 * 
 * Single source of truth for discovery data ingestion
 * Both Python screener and AlphaStack paths must normalize to this contract
 */

import { z } from "zod";

export const DiscoveryV1 = z.object({
  // Core identification and scoring (required)
  ticker: z.string().min(1).max(10),
  score: z.number().min(0).max(100),
  price: z.number().positive().nullable(),
  confidence: z.enum(["low", "high"]).default("low"),
  
  // Market microstructure indicators (optional, enriched data)
  relVol: z.number().nonnegative().nullable().default(null),
  atrPct: z.number().nonnegative().nullable().default(null),
  rsi: z.number().min(0).max(100).nullable().default(null),
  vwapDistPct: z.number().nullable().default(null),
  
  // Short squeeze / borrow indicators (optional)
  shortInterestPct: z.number().nonnegative().nullable().default(null),
  borrowFeePct: z.number().nonnegative().nullable().default(null),
  utilizationPct: z.number().min(0).max(100).nullable().default(null),
  
  // Options flow indicators (optional)
  ivPercentile: z.number().min(0).max(100).nullable().default(null),
  callPutRatio: z.number().nonnegative().nullable().default(null),
  
  // Fundamental and sentiment (optional)
  catalyst: z.string().nullable().default(null),
  sentimentScore: z.number().min(-1).max(1).nullable().default(null),
  
  // Reasoning and metadata
  reasons: z.array(z.string()).default([]),
  meta: z.record(z.any()).default({})
});

export type DiscoveryV1 = z.infer<typeof DiscoveryV1>;

// Validation helpers
export function validateDiscovery(data: unknown): DiscoveryV1 {
  return DiscoveryV1.parse(data);
}

export function safeValidateDiscovery(data: unknown): { success: true; data: DiscoveryV1 } | { success: false; error: string } {
  try {
    const validated = DiscoveryV1.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof z.ZodError ? error.message : String(error) 
    };
  }
}