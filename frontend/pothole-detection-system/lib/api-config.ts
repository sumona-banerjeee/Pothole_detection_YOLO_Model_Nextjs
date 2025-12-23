/**
 * API Configuration
 * 
 * Update these URLs when your backend APIs are ready
 */

export const API_CONFIG = {
  // Base URL for REST API
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  
  // WebSocket URL (if different from base URL)
  WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000",
  
  // API Endpoints
  ENDPOINTS: {
    UPLOAD: "/api/v1/upload",
    STATUS: (videoId: string) => `/api/v1/status/${videoId}`,
    RESULTS: (videoId: string) => `/api/v1/results/${videoId}`,
    VIDEOS: "/api/v1/videos",
    WEBSOCKET: (videoId: string) => `/api/v1/ws/${videoId}`,
  },
  
  // Polling configuration
  POLLING: {
    INTERVAL: 2000, // Poll every 2 seconds
    MAX_RETRIES: 150, // Maximum polling attempts (5 minutes)
  },
  
  // WebSocket configuration
  WEBSOCKET: {
    RECONNECT_ATTEMPTS: 3,
    RECONNECT_DELAY: 2000,
  },
};

/**
 * Helper function to build full API URL
 */
export function buildApiUrl(endpoint: string): string {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}

/**
 * Helper function to build WebSocket URL
 */
export function buildWsUrl(endpoint: string): string {
  return `${API_CONFIG.WS_URL}${endpoint}`;
}

/**
 * API Response Types
 */
export interface UploadResponse {
  video_id: string;
  message?: string;
}

export interface StatusResponse {
  status: string;
  progress?: number;
  message?: string;
  unique_potholes?: number;
  total_detections?: number;
}

export interface VideoListResponse {
  videos: Array<{
    video_id: string;
    video_path: string;
    created_at: string;
  }>;
}