import { useEffect, useRef } from "react"
import type { Detection } from "@/app/page"

export interface DetectionBufferEntry {
  timestamp_ms: number
  detections: Detection[]
}

export function useWebSocket(
  videoId: string,
  onDetections: (entry: DetectionBufferEntry) => void,
  onLog: (message: string, timestamp_ms?: number) => void
) {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/${videoId}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("WebSocket connected for video:", videoId)
      onLog("Connected to detection stream")
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Handle detection messages
        if (data.detections && Array.isArray(data.detections)) {
          onDetections({
            timestamp_ms: data.timestamp_ms || Date.now(),
            detections: data.detections
          })
          
          const potholeCount = data.detections.filter((d: Detection) => d.class === "pothole").length
          const signboardCount = data.detections.filter((d: Detection) => d.class === "signboard").length
          
          if (potholeCount > 0 && signboardCount > 0) {
            onLog(`Detected ${potholeCount} pothole(s) and ${signboardCount} signboard(s)`, data.timestamp_ms)
          } else if (potholeCount > 0) {
            onLog(`Detected ${potholeCount} pothole(s)`, data.timestamp_ms)
          } else if (signboardCount > 0) {
            onLog(`Detected ${signboardCount} signboard(s)`, data.timestamp_ms)
          }
        }
        
        // Handle status messages
        if (data.status) {
          onLog(`Status: ${data.status}`)
        }
        
        // Handle progress messages
        if (data.progress !== undefined) {
          onLog(`Processing: ${data.progress}%`)
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error)
      }
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
      onLog("Connection error - retrying...")
    }

    ws.onclose = () => {
      console.log("WebSocket closed for video:", videoId)
      onLog("Detection stream ended")
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [videoId, onDetections, onLog])

  return wsRef
}