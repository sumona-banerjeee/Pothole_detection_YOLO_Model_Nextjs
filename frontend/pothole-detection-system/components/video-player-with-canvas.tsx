"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useWebSocket, type DetectionBufferEntry } from "@/hooks/use-websocket"
import type { Detection } from "@/app/page"

interface VideoPlayerWithCanvasProps {
  videoUrl: string
  videoId: string
  fps: number          // NEW: pass backend fps here
  onNewLog: (message: string, timestamp_ms?: number) => void
}

export function VideoPlayerWithCanvas({
  videoUrl,
  videoId,
  fps,
  onNewLog,
}: VideoPlayerWithCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>()

  const detectionBufferRef = useRef<DetectionBufferEntry[]>([])
  const [currentDetections, setCurrentDetections] = useState<Detection[]>([])
  const [currentFrame, setCurrentFrame] = useState(0)

  const handleNewDetections = (entry: DetectionBufferEntry) => {
    detectionBufferRef.current.push(entry)
    detectionBufferRef.current.sort((a, b) => a.timestamp_ms - b.timestamp_ms)
  }

  useWebSocket(videoId, handleNewDetections, onNewLog)

  // Sync canvas size with video - INTERNAL resolution = video resolution
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const updateCanvasSize = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      console.log("Canvas resolution set to:", canvas.width, "x", canvas.height)
      console.log("Video resolution:", video.videoWidth, "x", video.videoHeight)
    }

    video.addEventListener("loadedmetadata", updateCanvasSize)
    window.addEventListener("resize", updateCanvasSize)

    return () => {
      video.removeEventListener("loadedmetadata", updateCanvasSize)
      window.removeEventListener("resize", updateCanvasSize)
    }
  }, [])

  // Sync detections with video playback
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncDetections = () => {
      const currentVideoTimeMs = video.currentTime * 1000

      // Use backend fps (prop) to compute frame index
      setCurrentFrame(Math.floor(video.currentTime * fps))

      // Clean old detections (keep last ~200ms)
      detectionBufferRef.current = detectionBufferRef.current.filter(
        (entry) => entry.timestamp_ms >= currentVideoTimeMs - 200
      )

      // Match detection within ±100ms of current time
      const matchingEntry = detectionBufferRef.current.find(
        (entry) => Math.abs(currentVideoTimeMs - entry.timestamp_ms) <= 100
      )

      if (matchingEntry) {
        setCurrentDetections(matchingEntry.detections)
      } else if (detectionBufferRef.current.length === 0) {
        setCurrentDetections([])
      }

      animationFrameRef.current = requestAnimationFrame(syncDetections)
    }

    animationFrameRef.current = requestAnimationFrame(syncDetections)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [fps])

  // Draw detections on canvas (bbox already in video pixel space)
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (currentDetections.length === 0) {
      return
    }

    console.log("Drawing", currentDetections.length, "detections on frame", currentFrame)

    currentDetections.forEach((detection) => {
      const [x1, y1, x2, y2] = detection.bbox
      const width = x2 - x1
      const height = y2 - y1

      console.log("Detection bbox:", { x1, y1, x2, y2, width, height })

      const color = detection.class === "pothole" ? "#ef4444" : "#3b82f6"

      // Thin bounding box
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeRect(x1, y1, width, height)

      // Semi-transparent fill
      ctx.fillStyle =
        detection.class === "pothole"
          ? "rgba(239, 68, 68, 0.15)"
          : "rgba(59, 130, 246, 0.15)"
      ctx.fillRect(x1, y1, width, height)

      // Label
      const label = `${detection.class} ${(detection.confidence * 100).toFixed(0)}%`
      ctx.font = "bold 16px sans-serif"
      const textMetrics = ctx.measureText(label)
      const textHeight = 20
      const padding = 4

      ctx.fillStyle = color
      ctx.globalAlpha = 0.9
      ctx.fillRect(
        x1,
        y1 - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      )

      ctx.globalAlpha = 1
      ctx.fillStyle = "#ffffff"
      ctx.fillText(label, x1 + padding, y1 - padding - 4)
    })
  }, [currentDetections, currentFrame])

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-700/70 px-6 py-3">
        <h2 className="text-lg font-semibold text-white">Video Analysis</h2>
        <span className="text-sm text-slate-400">
          Time: {videoRef.current?.currentTime.toFixed(1) || 0}s
        </span>
      </div>

      <div className="p-6">
        <div
          ref={containerRef}
          className="relative w-full aspect-video bg-black rounded-xl overflow-hidden"
        >
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            controls
            className="w-full h-full"
            style={{ display: "block" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{
              imageRendering: "crisp-edges",
              objectFit: "contain",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-6 text-sm text-slate-300">
          <div className="flex gap-4">
            <div>
              <span className="text-slate-400">Current Frame: </span>
              <span className="font-semibold text-white">{currentFrame}</span>
            </div>
            <div>
              <span className="text-slate-400">Detections: </span>
              <span className="font-semibold text-white">
                {currentDetections.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#ef4444] rounded" />
              <span className="text-xs text-slate-400">Pothole</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#3b82f6] rounded" />
              <span className="text-xs text-slate-400">Signboard</span>
            </div>
          </div>
          <span className="text-xs text-slate-500">Real-time detection</span>
        </div>
      </div>
    </div>
  )
}