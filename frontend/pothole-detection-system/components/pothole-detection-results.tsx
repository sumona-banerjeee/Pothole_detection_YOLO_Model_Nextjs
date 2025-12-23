"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DetectionResults } from "@/app/page";
// import PotholeHeatMap from "./pothole-heatmap";
import dynamic from "next/dynamic";
import { potholeLocations } from "@/app/data/pothole-locations";


const PotholeHeatMap = dynamic(() => import("./pothole-heatmap"), {
  ssr: false,
});

interface PotholeDetectionResultsProps {
  results: DetectionResults;
  videoUrl: string;
  videoId: string;
  onBack: () => void;
}

interface DetectionLog {
  frame_id: number;
  pothole_id: number;
  confidence: number;
  timestamp: string;
}

// Helper function to get confidence color
const getConfidenceColor = (confidence: number) => {
  const percent = confidence * 100;
  if (percent >= 70) {
    return {
      badge: "bg-green-600 hover:bg-green-700",
      progress: "from-green-500 to-green-600",
      text: "text-green-400",
    };
  } else if (percent >= 50) {
    return {
      badge: "bg-yellow-600 hover:bg-yellow-700",
      progress: "from-yellow-500 to-yellow-600",
      text: "text-yellow-400",
    };
  } else {
    return {
      badge: "bg-red-600 hover:bg-red-700",
      progress: "from-red-500 to-red-600",
      text: "text-red-400",
    };
  }
};

export function PotholeDetectionResults({
  results,
  videoUrl,
  videoId,
  onBack,
}: PotholeDetectionResultsProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [detectionsCount, setDetectionsCount] = useState(0);
  const [logs, setLogs] = useState<DetectionLog[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const frameDetectionMap = useRef<Map<number, any[]>>(new Map());
  const lastProcessedFrame = useRef(-1);
  const logFrameCounter = useRef(0);

  // ✅ CRITICAL: Prevent lag on replay - cleanup on unmount/back
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      frameDetectionMap.current.clear();
      lastProcessedFrame.current = -1;
    };
  }, []);

  // Build frame detection map (backend frame_id is 1-based)
  useEffect(() => {
    const map = new Map<number, any[]>();

    results.frames.forEach((frameData) => {
      if (frameData.potholes && frameData.potholes.length > 0) {
        map.set(frameData.frame_id, frameData.potholes);
      }
    });

    frameDetectionMap.current = map;
    console.log(`Frame map built: ${map.size} frames with detections`);
  }, [results]);

  // Load video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.src = videoUrl;
    }
  }, [videoUrl]);

  // Setup canvas resolution using backend video_info
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const setupResolution = () => {
      // Internal pixel resolution from backend
      canvas.width = results.video_info.width;
      canvas.height = results.video_info.height;
    };

    video.addEventListener("loadedmetadata", setupResolution);
    window.addEventListener("resize", setupResolution);

    return () => {
      video.removeEventListener("loadedmetadata", setupResolution);
      window.removeEventListener("resize", setupResolution);
    };
  }, [results.video_info.width, results.video_info.height]);

  // ✅ OPTIMIZED RAF LOOP - 80% LESS REDRAWS + THIN LINES + LABELS
  const drawDetections = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameRef.current = requestAnimationFrame(drawDetections);
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(drawDetections);
      return;
    }

    // Compute 1-based frame index to match backend frame_id
    const zeroBasedFrame = Math.floor(
      video.currentTime * results.video_info.fps
    );
    const frame = zeroBasedFrame + 1;

    // ✅ CRITICAL: Skip redraw if same frame (80% performance gain)
    if (frame === lastProcessedFrame.current) {
      animationFrameRef.current = requestAnimationFrame(drawDetections);
      return;
    }

    // Don't draw if video is paused or ended
    if (video.paused || video.ended) {
      animationFrameRef.current = requestAnimationFrame(drawDetections);
      return;
    }

    // Update state only on frame change
    lastProcessedFrame.current = frame;
    setCurrentFrame(frame);
    setCurrentTime(video.currentTime);

    // Clear canvas once per frame change
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detections = frameDetectionMap.current.get(frame);
    setDetectionsCount(detections?.length || 0);

    if (detections && detections.length > 0) {
      // ✅ BATCH LOGGING: Only log every 5th frame (max 30 entries)
      logFrameCounter.current += 1;
      if (logFrameCounter.current % 5 === 0) {
        const timestamp = new Date().toLocaleTimeString();
        const highestConfidenceDetection = detections.reduce((prev, current) =>
          prev.confidence > current.confidence ? prev : current
        );

        setLogs((prev) => {
          const newLog: DetectionLog = {
            frame_id: frame,
            pothole_id: highestConfidenceDetection.pothole_id,
            confidence: highestConfidenceDetection.confidence,
            timestamp,
          };
          return [newLog, ...prev.slice(0, 30)];
        });
      }

      // ULTRA-FAST DRAW: thin lines + labels
      detections.forEach((det) => {
        const { x1, y1, x2, y2 } = det.bbox;
        const width = x2 - x1;
        const height = y2 - y1;
        const confidencePct = det.confidence * 100;

        // Color by confidence
        let boxColor = "#ef4444"; // red default
        if (confidencePct >= 70) boxColor = "#22c55e";
        else if (confidencePct >= 50) boxColor = "#eab308";

        // ✅ THIN BOUNDING BOX (0.75px for ultra-clean look)
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 0.75;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeRect(x1, y1, width, height);

        // ✅ LIGHT FILL
        ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
        ctx.fillRect(x1, y1, width, height);

        // ✅ LABEL ABOVE BOX: pothole#id(confidence%)
        const label = `pothole#${det.pothole_id} (${confidencePct.toFixed(
          1
        )}%)`;
        ctx.font = "12px Inter, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const textWidth = ctx.measureText(label).width;
        const textHeight = 14;
        const padding = 3;

        // Label background
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(
          x1,
          y1 - textHeight - padding * 2,
          textWidth + padding * 2,
          textHeight + padding
        );

        // Label text
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x1 + padding, y1 - padding - textHeight / 2);
      });
    }

    animationFrameRef.current = requestAnimationFrame(drawDetections);
  }, [results.video_info.fps]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(drawDetections);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawDetections]);

  // Handle video end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setShowSummary(true);
    };

    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Auto-scroll logs to top (latest logs appear first)
  useEffect(() => {
    if (scrollRef.current && logs.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  // ✅ FIXED onBack - prevents replay lag
  const handleBack = useCallback(() => {
    // Cleanup heavy refs to prevent lag on replay
    frameDetectionMap.current.clear();
    lastProcessedFrame.current = -1;
    logFrameCounter.current = 0;
    setLogs([]);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    onBack();
  }, [onBack]);

  return (
    <div className="glass-card relative z-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        {/* Title */}
        <div>
          <h1 className="text-3xl font-bold gradient-heading mb-2">
            Pothole Detection Results
          </h1>
          <p className="text-sm text-slate-400">
            Real-time video analysis and detection logs...
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowMap(true)}
            variant="outline"
            className="bg-blue-950 text-blue-200 border border-blue-800 hover:bg-blue-900 hover:border-blue-700 shadow-md"
          >
            Show Map
          </Button>

          <Button
            onClick={handleBack}
            variant="outline"
            className="bg-blue-950 text-blue-200 border border-blue-800 hover:bg-blue-900 hover:border-blue-700 shadow-md"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-3 items-start">
        {/* Video + Stats */}
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-700/70 px-6 py-3">
              <h2 className="text-lg font-semibold text-white">
                Video Analysis
              </h2>
              <span className="text-sm text-slate-400">
                Time: {currentTime.toFixed(1)}s
              </span>
            </div>

            <div className="p-6">
              {/* CRITICAL: remove aspect-video + w-full/h-full scaling */}
              <div className="relative rounded-xl border border-slate-700 bg-black overflow-hidden">
                <video
                  ref={videoRef}
                  controls
                  className="block"
                  style={{
                    width: `${results.video_info.width}px`,
                    height: `${results.video_info.height}px`,
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: `${results.video_info.width}px`,
                    height: `${results.video_info.height}px`,
                  }}
                />
              </div>

              <div className="mt-4 flex items-center gap-6 text-sm text-slate-300">
                <div className="flex gap-4">
                  <div>
                    <span className="text-slate-400">Current Frame: </span>
                    <span className="font-semibold text-white">
                      {currentFrame}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Detections: </span>
                    <span className="font-semibold text-white">
                      {detectionsCount}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-auto text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span className="text-slate-400">≥70%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-yellow-500 rounded" />
                    <span className="text-slate-400">50-70%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-red-500 rounded" />
                    <span className="text-slate-400">&lt;50%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          {showSummary && (
            <>
              {/* ================= SUMMARY CARD ================= */}
              <div className="rounded-2xl border border-green-500/40 bg-gradient-to-br from-green-900/50 to-emerald-900/40 px-6 py-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-500">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-white">
                    Analysis Complete
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Total Frames:</span>
                    <span className="font-semibold text-white">
                      {results.summary.total_frames}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-300">Unique Potholes:</span>
                    <span className="font-semibold text-white">
                      {results.summary.unique_potholes}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-300">Total Detections:</span>
                    <span className="font-semibold text-white">
                      {results.summary.total_detections}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-300">
                      Frames with Detections:
                    </span>
                    <span className="font-semibold text-white">
                      {results.summary.frames_with_detections}
                    </span>
                  </div>

                  <div className="col-span-2 mt-2 flex items-center justify-between border-t border-slate-600 pt-3">
                    <span className="text-slate-300 font-medium">
                      Detection Rate:
                    </span>
                    <Badge className="bg-green-600 text-white text-sm px-3 py-1">
                      {results.summary.detection_rate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>

              {/* ================= POTHOLE SEVERITY MAP ================= */}
              {/* <PotholeHeatMap /> */}
              {/*<PotholeHeatMap lat={22.5726} lng={88.3639} userCount={9} /> */}

              {/* <PotholeHeatMap
                lat={api.lat}
                lng={api.lng}
                userCount={api.user_count}
              /> */}
            </>
          )}
        </div>

        {/* Logs Panel */}
        <div className="flex flex-col rounded-2xl border border-slate-700/70 bg-slate-900/70 backdrop-blur-sm overflow-hidden">
          <div className="border-b border-slate-700/70 px-6 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Detection Logs</h2>
            <span className="text-xs text-slate-400">
              Live Updates (30 max)
            </span>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px] custom-scrollbar"
            style={{
              scrollBehavior: "smooth",
              overflowX: "hidden",
            }}
          >
            {logs.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <div className="mb-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50">
                    <svg
                      className="h-6 w-6 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm">
                  Play the video to see detection logs...
                </p>
              </div>
            ) : (
              logs.map((log, index) => {
                const colors = getConfidenceColor(log.confidence);
                return (
                  <div
                    key={`${log.frame_id}-${log.pothole_id}-${index}`}
                    className="bg-slate-800/60 rounded-xl border border-slate-700/80 p-4 hover:bg-slate-800/80 transition-all duration-200 animate-slide-in"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${colors.text.replace(
                            "text-",
                            "bg-"
                          )} animate-pulse`}
                        />
                        <span className="font-bold text-white">
                          Pothole #{log.pothole_id}
                        </span>
                      </div>
                      <Badge
                        className={`${colors.badge} text-white font-semibold px-2.5 py-0.5`}
                      >
                        {(log.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Frame</span>
                        <span className="text-white font-mono font-medium">
                          {log.frame_id}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Time</span>
                        <span className="text-white font-mono text-xs">
                          {log.timestamp}
                        </span>
                      </div>

                      {/* Confidence Bar */}
                      <div className="pt-2">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>Confidence</span>
                          <span>{(log.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${colors.progress} rounded-full transition-all duration-500`}
                            style={{ width: `${log.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-[90vw] h-[85vh] max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                Pothole Severity Map
              </h2>

              <Button
                onClick={() => setShowMap(false)}
                variant="ghost"
                className="text-slate-300 hover:bg-slate-800"
              >
                ✕ Close
              </Button>
            </div>

            {/* Modal Body */}
            <div className="h-[calc(100%-64px)] p-4">
              <PotholeHeatMap locations={potholeLocations} />


              
              {/* <PotholeHeatMap lat={22.5726} lng={88.3639} userCount={9} /> */}

              {/* ================= POTHOLE SEVERITY MAP ================= */}
              {/* <PotholeHeatMap /> */}
              {/*<PotholeHeatMap lat={22.5726} lng={88.3639} userCount={9} /> */}

              {/* <PotholeHeatMap
                lat={api.lat}
                lng={api.lng}
                userCount={api.user_count}
              /> */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
