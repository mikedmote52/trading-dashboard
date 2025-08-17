/**
 * Discovery Tile Renderer - UI Data Upgrade
 * Enforces ~$100 purchase sizing, surfaces real thesis data, no mock content
 */

/**
 * Compute quantity for ~$100 sizing
 */
function computeQty(stock, targetDollars = 100) {
  const price = stock.currentPrice || stock.price || 1;
  
  // Use backend recommendedQuantity if provided and valid
  if (stock.recommendedQuantity && stock.recommendedQuantity > 0) {
    return stock.recommendedQuantity;
  }
  
  // Default to ~$100 sizing
  return Math.max(1, Math.floor(targetDollars / price));
}

/**
 * Get real thesis text from backend fields
 */
function getRealThesis(stock) {
  // Only show thesis if backend provides real data
  const sources = [
    stock.thesis,
    stock.thesisNotes, 
    stock.reason,
    stock.catalystDetails
  ];
  
  const realThesis = sources.find(t => t && t.trim() && t !== 'undefined');
  return realThesis || null;
}

/**
 * Render action buttons with ~$100 sizing
 */
function renderActionButtons(stock) {
  const qty = computeQty(stock, 100);
  const cost = Math.round(qty * (stock.currentPrice || stock.price || 1));
  
  if (stock.action === 'BUY') {
    return `
      <button onclick="showTradeModal('buy', '${stock.symbol || stock.ticker}', ${qty})" 
              class="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-xs font-medium transition-colors mb-1 block w-full">
          💰 BUY ${qty}
      </button>
      <div class="text-xs text-green-300 mb-1">~$${cost}</div>
      <button onclick="window.dashboard.addToWatchlist('${stock.symbol || stock.ticker}')" 
              class="bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded text-xs transition-colors block w-full">
          👁️ Watch
      </button>
    `;
  } else if (stock.action === 'WATCHLIST') {
    return `
      <button onclick="window.dashboard.addToWatchlist('${stock.symbol || stock.ticker}')" 
              class="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-xs transition-colors mb-1 block w-full">
          👁️ Watch
      </button>
      <button onclick="showTradeModal('buy', '${stock.symbol || stock.ticker}', ${qty})" 
              class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors block w-full">
          💰 Buy
      </button>
    `;
  } else {
    return `
      <button onclick="window.dashboard.addToMonitor('${stock.symbol || stock.ticker}')" 
              class="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs transition-colors mb-1 block w-full">
          📊 Monitor
      </button>
      <button onclick="showTradeModal('buy', '${stock.symbol || stock.ticker}', ${qty})" 
              class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs transition-colors block w-full">
          💰 Buy
      </button>
    `;
  }
}

/**
 * Render optional data chips (auto-hide if missing)
 */
function renderDataChips(stock) {
  const chips = [];
  
  // Options data
  if (stock.options?.callPutRatio) {
    chips.push(`C/P: ${stock.options.callPutRatio.toFixed(1)}`);
  }
  if (stock.options?.ivPercentile) {
    chips.push(`IV: ${stock.options.ivPercentile}%`);
  }
  
  // Technical data
  if (stock.technicals?.rsi) {
    chips.push(`RSI: ${stock.technicals.rsi.toFixed(0)}`);
  }
  if (stock.shortInterest) {
    chips.push(`SI: ${stock.shortInterest.toFixed(1)}%`);
  }
  
  return chips.length > 0 ? `
    <div class="flex flex-wrap gap-1 mt-2">
      ${chips.map(chip => `<span class="text-xs bg-gray-700 px-2 py-1 rounded">${chip}</span>`).join('')}
    </div>
  ` : '';
}

/**
 * Render single discovery tile
 */
export function renderDiscoveryTile(stock) {
  const symbol = stock.symbol || stock.ticker;
  const price = stock.currentPrice || stock.price || 0;
  const score = stock.score || 0;
  const explosivenessScore = stock.explosivenessScore || null;
  const maxScore = Math.max(score, explosivenessScore || 0);
  const realThesis = getRealThesis(stock);
  
  return `
    <div class="bg-white bg-opacity-10 rounded-lg p-4 border-l-4 hover:transform hover:scale-105 transition-all ${
      stock.action === 'BUY' ? 'border-green-400' : 
      stock.action === 'WATCHLIST' ? 'border-yellow-400' : 'border-blue-400'
    }">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-2">
            <span class="font-bold text-lg">${symbol}</span>
            <span class="text-xs px-2 py-1 rounded ${
              stock.action === 'BUY' ? 'bg-green-600 text-green-100' : 
              stock.action === 'WATCHLIST' ? 'bg-yellow-600 text-yellow-100' : 'bg-blue-600 text-blue-100'
            }">${stock.action}</span>
            <span class="text-sm font-bold ${
              score >= 80 ? 'text-green-400' : 
              score >= 70 ? 'text-yellow-400' : 'text-orange-400'
            }">${score}%</span>
            ${explosivenessScore ? `
              <span class="text-xs px-2 py-1 rounded ${
                explosivenessScore >= 70 ? 'bg-red-600 text-red-100' :
                explosivenessScore >= 50 ? 'bg-orange-600 text-orange-100' :
                explosivenessScore >= 30 ? 'bg-yellow-600 text-yellow-100' :
                'bg-gray-600 text-gray-100'
              }" title="Explosiveness Score: Technical + Short Interest + Options Flow">
                  💥 ${explosivenessScore}
              </span>
            ` : ''}
            ${stock.isHighConfidence ? `
              <span class="text-xs bg-purple-600 px-2 py-1 rounded" title="High Confidence VIGL Pattern">
                  ⭐ VIGL
              </span>
            ` : ''}
          </div>
          <div class="text-sm text-blue-200 mb-2">${stock.name || symbol}</div>
          <div class="grid grid-cols-2 gap-3 text-sm mb-2">
            <div>Price: <span class="text-white">$${price.toFixed(2)}</span></div>
            <div>Volume: <span class="text-yellow-400">${(stock.volumeSpike || stock.volumeX || 1).toFixed(1)}x</span></div>
            <div>Upside: <span class="text-green-400">${stock.estimatedUpside || 'TBD'}</span></div>
            <div>Timeline: <span class="text-blue-400">${stock.timeline || 'TBD'}</span></div>
            ${stock.targetPrices?.moderate ? `
              <div>Target: <span class="text-yellow-300">$${stock.targetPrices.moderate.toFixed(2)}</span></div>
              <div>Risk: <span class="text-orange-400">${stock.riskLevel || 'MODERATE'}</span></div>
            ` : ''}
          </div>
          
          ${realThesis ? `
            <div class="text-xs text-blue-100 bg-black bg-opacity-20 rounded px-2 py-1 mb-2">
              <span class="text-blue-300">📋</span> ${realThesis}
            </div>
          ` : ''}
          
          ${stock.catalysts && stock.catalysts.length > 0 ? `
            <div class="text-xs text-blue-300 bg-black bg-opacity-20 rounded px-2 py-1">
              📋 ${stock.catalysts.join(', ')}
            </div>
          ` : ''}
          
          ${renderDataChips(stock)}
        </div>
        <div class="text-right ml-4">
          <div class="text-sm font-bold mb-2 ${
            (stock.positionSize === 'LARGE') ? 'text-green-400' : 
            (stock.positionSize === 'MEDIUM') ? 'text-yellow-400' : 'text-blue-400'
          }">${stock.positionSize || 'SMALL'}</div>
          ${renderActionButtons(stock)}
        </div>
      </div>
      <div class="mt-2 h-1 bg-gray-700 rounded">
        <div class="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded" 
             style="width: ${Math.min(maxScore, 100)}%"></div>
      </div>
    </div>
  `;
}

/**
 * Render multiple discovery tiles
 */
export function renderDiscoveryTiles(discoveries) {
  return discoveries.map(stock => renderDiscoveryTile(stock)).join('');
}

/**
 * Render skeleton loading tiles
 */
export function renderSkeletonTiles(count = 6) {
  const skeleton = `
    <div class="bg-white bg-opacity-10 rounded-lg p-4 border-l-4 border-gray-400 animate-pulse">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-2">
            <div class="bg-gray-600 rounded w-12 h-6"></div>
            <div class="bg-gray-600 rounded w-16 h-5"></div>
            <div class="bg-gray-600 rounded w-8 h-5"></div>
          </div>
          <div class="bg-gray-600 rounded w-24 h-4 mb-2"></div>
          <div class="grid grid-cols-2 gap-3 mb-2">
            <div class="bg-gray-600 rounded w-16 h-4"></div>
            <div class="bg-gray-600 rounded w-16 h-4"></div>
            <div class="bg-gray-600 rounded w-16 h-4"></div>
            <div class="bg-gray-600 rounded w-16 h-4"></div>
          </div>
        </div>
        <div class="text-right ml-4">
          <div class="bg-gray-600 rounded w-12 h-4 mb-2"></div>
          <div class="bg-gray-600 rounded w-16 h-6"></div>
        </div>
      </div>
      <div class="mt-2 h-1 bg-gray-700 rounded"></div>
    </div>
  `;
  
  return Array(count).fill(skeleton).join('');
}

/**
 * Render empty state
 */
export function renderEmptyState() {
  return `
    <div class="col-span-full text-center py-12">
      <div class="text-6xl mb-4">🔍</div>
      <h3 class="text-xl font-bold mb-2">No VIGL Patterns Found</h3>
      <p class="text-blue-200">Click "Scan Market" to discover new opportunities</p>
    </div>
  `;
}