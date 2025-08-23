/**
 * Simplified Discovery Schema for debugging
 */

const { z } = require("zod");

const DiscoveryV1Simple = z.object({
  ticker: z.string(),
  score: z.number(),
  price: z.number().nullable(),
  confidence: z.string().optional(),
  meta: z.object({}).optional()
});

function validateDiscoverySimple(data) {
  return DiscoveryV1Simple.parse(data);
}

function safeValidateDiscoverySimple(data) {
  try {
    const validated = DiscoveryV1Simple.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return { 
      success: false, 
      error: String(error)
    };
  }
}

module.exports = {
  DiscoveryV1Simple,
  validateDiscoverySimple,
  safeValidateDiscoverySimple
};