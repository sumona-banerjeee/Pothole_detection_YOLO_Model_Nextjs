"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

type DetectionData = {
  frames: Array<{
    frame_id: number
    potholes: Array<{
      pothole_id: number
      bbox: { x1: number; y1: number; x2: number; y2: number }
      confidence: number
    }>
  }>
  video_info: {
    width: number
    height: number
    fps: number
    total_frames: number
  }
  summary: {
    unique_potholes: number
    total_detections: number
    total_frames: number
    detection_rate: number
  }
}

type VideoPlayerSectionProps = {
  data: DetectionData
  videoFile: File
}

type DetectionLog = {
  frame: number
  detections: Array<{
    pothole_id: number
    bbox: { x1: number; y1: number; x2: number; y2: number }
    confidence: number
  }>
  timestamp: string
}

export default function VideoPlayerSection({ data, videoFile }: VideoPlayerSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [currentFrame, setCurrentFrame] = useState(0)
  const [detectionsCount, setDetectionsCount] = useState(0)
  const [logs, setLogs] = useState<DetectionLog[]>([])
  const [showSummary, setShowSummary] = useState(false)

  const frameDetectionMap = useRef<Map<number, any[]>>(new Map())
  const lastProcessedFrame = useRef(-1)
  const logFrameCounter = useRef(0)

  // Build optimized frame detection map (keyed by backend frame_id, 1-based)
  useEffect(() => {
    const map = new Map<number, any[]>()

    if (data.frames && Array.isArray(data.frames)) {
      console.log(`Building frame map from ${data.frames.length} frames`)
      data.frames.forEach((frameData) => {
        const frameId = frameData.frame_id
        const potholes = frameData.potholes || []
        if (potholes.length > 0) {
          map.set(frameId, potholes)
        }
      })
      console.log(`Frame map built: ${map.size} frames with detections`)
    }

    frameDetectionMap.current = map
  }, [data])

  // Load video file
  useEffect(() => {
    if (videoRef.current && videoFile) {
      const url = URL.createObjectURL(videoFile)
      videoRef.current.src = url

      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [videoFile])

  // Setup canvas + video sizing so their rectangles match exactly
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const setupResolution = () => {
      // Internal pixel resolution from backend
      canvas.width = data.video_info.width
      canvas.height = data.video_info.height

      // Force video and canvas CSS size to the same pixel dimensions
      const widthPx = `${data.video_info.width}px`
      const heightPx = `${data.video_info.height}px`

      video.style.width = widthPx
      video.style.height = heightPx
      canvas.style.width = widthPx
      canvas.style.height = heightPx
    }

    video.addEventListener("loadedmetadata", setupResolution)
    window.addEventListener("resize", setupResolution)

    return () => {
      video.removeEventListener("loadedmetadata", setupResolution)
      window.removeEventListener("resize", setupResolution)
    }
  }, [data.video_info.width, data.video_info.height])

  // OPTIMIZED RAF LOOP - frame skipping + thin lines + batched logs
  const drawDetections = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.paused || video.ended) {
      animationFrameRef.current = requestAnimationFrame(drawDetections)
      return
    }

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(drawDetections)
      return
    }

    // Compute 1-based frame index to match backend frame_id
    const zeroBasedFrame = Math.floor(video.currentTime * data.video_info.fps)
    const frame = zeroBasedFrame + 1

    // Skip redraw if frame did not change
    if (frame === lastProcessedFrame.current) {
      animationFrameRef.current = requestAnimationFrame(drawDetections)
      return
    }

    lastProcessedFrame.current = frame
    setCurrentFrame(frame)

    // Clear canvas once per frame change
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Get detections for current frame (keys are 1-based frame_id)
    const detections = frameDetectionMap.current.get(frame)
    setDetectionsCount(detections?.length || 0)

    if (detections && detections.length > 0) {
      // Log every 5th frame only
      logFrameCounter.current += 1
      if (logFrameCounter.current % 5 === 0) {
        setLogs((prev) => {
          const newLog: DetectionLog = {
            frame,
            detections: detections.map((det) => ({
              pothole_id: det.pothole_id,
              bbox: det.bbox,
              confidence: det.confidence,
            })),
            timestamp: new Date().toLocaleTimeString(),
          }
          return [newLog, ...prev.slice(0, 30)]
        })
      }

      // Draw detections in backend pixel space (no extra scaling)
      detections.forEach((det) => {
        const { x1, y1, x2, y2 } = det.bbox
        const width = x2 - x1
        const height = y2 - y1

        ctx.strokeStyle = "#ef4444"
        ctx.lineWidth = 1
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.strokeRect(x1, y1, width, height)

        ctx.fillStyle = "rgba(239, 68, 68, 0.1)"
        ctx.fillRect(x1, y1, width, height)
      })
    }

    animationFrameRef.current = requestAnimationFrame(drawDetections)
  }, [data.video_info.fps])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(drawDetections)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [drawDetections])

  // Handle video end - show summary entry in logs
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleEnded = () => {
      setShowSummary(true)
      setTimeout(() => {
        setLogs((prev) => {
          const summaryLog: DetectionLog = {
            frame: -1,
            detections: [],
            timestamp: new Date().toLocaleTimeString(),
          }
          return [summaryLog, ...prev.slice(0, 30)]
        })
      }, 500)
    }

    video.addEventListener("ended", handleEnded)
    return () => {
      video.removeEventListener("ended", handleEnded)
    }
  }, [data])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Playback with Detection</CardTitle>
        <CardDescription>
          Watch the analyzed video with real-time bounding box overlays
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-2 space-y-4">
            <div
              ref={containerRef}
              className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center"
            >
              <video
                ref={videoRef}
                controls
                className="block"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 pointer-events-none"
              />
            </div>

            {/* Video Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Current Frame:</span>
                <Badge variant="secondary">{currentFrame}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Detections:</span>
                <Badge variant={detectionsCount > 0 ? "destructive" : "secondary"}>
                  {detectionsCount}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Resolution:</span>
                <Badge variant="outline">
                  {data.video_info.width}×{data.video_info.height}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">FPS:</span>
                <Badge variant="outline">{data.video_info.fps.toFixed(1)}</Badge>
              </div>
            </div>
          </div>

          {/* Detection Logs */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Detection Logs</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Real-time frame-by-frame detection tracking (limited to 30 entries)
              </p>
            </div>
            <ScrollArea className="h-[400px] rounded-md border bg-muted/30 p-4">
              <div className="space-y-2">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Play the video to see detection logs
                  </p>
                ) : (
                  logs.map((log, index) =>
                    log.frame === -1 ? (
                      // Summary entry
                      <div
                        key={`summary-${index}`}
                        className="text-xs p-4 bg-green-50 dark:bg-green-950 rounded-md border-l-4 border-green-500"
                      >
                        <div className="font-bold text-green-700 dark:text-green-300 mb-3 text-sm">
                          📊 DETECTION SUMMARY
                        </div>
                        <div className="space-y-1.5 text-foreground">
                          <div className="flex justify-between">
                            <span className="font-medium">Unique Potholes:</span>
                            <span className="font-bold">{data.summary.unique_potholes}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Total Detections:</span>
                            <span className="font-bold">{data.summary.total_detections}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Total Frames:</span>
                            <span className="font-bold">{data.summary.total_frames}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Detection Rate:</span>
                            <span className="font-bold">
                              {data.summary.detection_rate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Video FPS:</span>
                            <span className="font-bold">
                              {data.video_info.fps.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Resolution:</span>
                            <span className="font-bold">
                              {data.video_info.width}×{data.video_info.height}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Detection entry
                      <div
                        key={`${log.frame}-${index}`}
                        className="text-xs p-3 bg-card rounded-md border-l-2 border-red-500"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-foreground">
                            Frame: {log.frame}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            {log.timestamp}
                          </span>
                        </div>

                        {log.detections.length === 0 ? (
                          <div className="text-muted-foreground">No detections</div>
                        ) : (
                          <div className="space-y-2">
                            {log.detections.map((det, idx) => (
                              <div key={idx} className="space-y-1">
                                <div className="font-medium text-foreground">
                                  Pothole ID: {det.pothole_id} | Confidence:{" "}
                                  {(det.confidence * 100).toFixed(1)}%
                                </div>
                                <div className="text-muted-foreground font-mono text-[10px]">
                                  Coordinates: ({Math.round(det.bbox.x1)},{" "}
                                  {Math.round(det.bbox.y1)}) → (
                                  {Math.round(det.bbox.x2)},{" "}
                                  {Math.round(det.bbox.y2)})
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}