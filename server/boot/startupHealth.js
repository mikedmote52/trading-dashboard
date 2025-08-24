/**
 * Soft startup health check - allows degraded mode operation
 * No hard failures when feeds are down unless strict mode enabled
 */

const STRICT_STARTUP = process.env.STRICT_STARTUP === "true";
const SCREENER_STRICT_FEEDS = process.env.SCREENER_STRICT_FEEDS === "true";

/**
 * Check data feed status
 * @returns {Promise<{polygon: string, alpaca: string, alpaca_market_data: string}>}
 */
async function checkFeeds() {
  const feeds = {
    polygon: "UP",
    alpaca: "UP", 
    alpaca_market_data: "UP"
  };
  
  // Check Polygon API
  if (!process.env.POLYGON_API_KEY) {
    feeds.polygon = "DOWN";
  }
  
  // Check Alpaca API
  if (!process.env.APCA_API_KEY_ID || !process.env.APCA_API_SECRET_KEY) {
    feeds.alpaca = "DOWN";
    feeds.alpaca_market_data = "DOWN";
  }
  
  // Could add actual API ping tests here if needed
  // For now, just check env vars as proxy for feed availability
  
  return feeds;
}

/**
 * Run startup health check with soft failure mode
 */
async function runStartupHealth() {
  if (!STRICT_STARTUP) {
    console.log("ℹ️  Startup health check disabled (set STRICT_STARTUP=true to enable)");
    return;
  }
  
  const status = await checkFeeds();
  const degraded = Object.values(status).some(s => s === "DOWN");
  
  if (!degraded) {
    console.log("✅ Startup feeds healthy", status);
    return;
  }
  
  if (SCREENER_STRICT_FEEDS) {
    console.error("❌ Startup blocked: data feeds not healthy (strict mode)", status);
    console.error("Set SCREENER_STRICT_FEEDS=false to allow degraded operation");
    process.exit(1);
  }
  
  console.warn("⚠️ Startup continuing in degraded mode", status);
  console.warn("Some features may be limited. Set required API keys to restore full functionality.");
}

module.exports = { runStartupHealth, checkFeeds };