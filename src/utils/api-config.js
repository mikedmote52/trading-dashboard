/**
 * API Configuration Helper
 * Ensures correct base URL for API calls in all environments
 */

export const API_BASE = process.env.CLIENT_API_BASE || (typeof window !== 'undefined'
  ? `${window.location.origin}`
  : 'http://localhost:3003'); // or your dev port

/**
 * Construct full API URL
 * @param {string} path - API path starting with /api/...
 * @returns {string} - Full URL for the API endpoint
 */
export function apiUrl(path) {
  // Ensure path starts with /api/
  if (!path.startsWith('/api/')) {
    path = `/api/${path.replace(/^\//, '')}`;
  }
  
  return `${API_BASE}${path}`;
}

/**
 * Fetch with automatic API base URL
 * @param {string} path - API path
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export async function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
}