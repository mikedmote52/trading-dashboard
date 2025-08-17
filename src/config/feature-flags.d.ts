/**
 * TypeScript declarations for feature flags
 */

export interface FeatureFlags {
  ALPHASTACK_V3_ENABLED: boolean;
  V3_PERFORMANCE_MODE: boolean;
  V3_REAL_TIME_UPDATES: boolean;
  V3_DENSE_LAYOUT: boolean;
  V3_MOBILE_OPTIMIZATION: boolean;
  V3_DARK_THEME: boolean;
  V3_API_CACHING: boolean;
  V3_ERROR_BOUNDARIES: boolean;
  V3_GRACEFUL_DEGRADATION: boolean;
  ALPHASTACK_PROTECTION: boolean;
  READ_ONLY_MODE: boolean;
  CIRCUIT_BREAKER: boolean;
  DEBUG_MODE: boolean;
  PERFORMANCE_MONITORING: boolean;
  API_LOGGING: boolean;
}

export interface FeatureConfig {
  version: 'v2' | 'v3';
  features: string[];
  protection: {
    alphastack_immutable: boolean;
    read_only_mode: boolean;
    circuit_breaker: boolean;
  };
  performance: {
    real_time_updates: boolean;
    api_caching: boolean;
    performance_mode: boolean;
  };
}

export declare function isEnabled(flag: keyof FeatureFlags): boolean;
export declare function shouldUseV3(): boolean;
export declare function isInFallbackMode(): boolean;
export declare function getEnabledFeatures(): string[];
export declare function getConfig(): FeatureConfig;
export declare const FEATURE_FLAGS: FeatureFlags;