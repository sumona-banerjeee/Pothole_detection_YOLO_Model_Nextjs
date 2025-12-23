"use client";

import { useState } from "react";
import { VideoUpload } from "@/components/video-upload";
import { PotholeDetectionResults } from "@/components/pothole-detection-results";

export interface PotholeDetection {
  frame_id: number;
  pothole_id: number | null;
  type: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  center: {
    x: number;
    y: number;
  };
  area: number;
}

export interface FrameData {
  frame_id: number;
  speed_kmh: number;
  roi_ratio: number;
  potholes: PotholeDetection[];
}

export interface DetectionResults {
  video_id: string;         // from backend
  video_path: string;
  speed_kmh: number;
  frames: FrameData[];
  video_info: {             // NEW: must match video_processor.py
    total_frames: number;
    fps: number;
    duration: number;
    width: number;
    height: number;
    resolution: string;
  };
  summary: {
    total_frames: number;
    unique_potholes: number;
    total_detections: number;
    frames_with_detections: number;
    detection_rate: number;
  };
  pothole_list: Array<{
    pothole_id: number;
    first_detected_frame: number;
    first_detected_time: number;
    confidence: number;
  }>;
}

export default function Home() {
  const [detectionResults, setDetectionResults] = useState<DetectionResults | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  const handleUploadComplete = (results: DetectionResults, videoUrl: string, videoId: string) => {
    setDetectionResults(results);
    setVideoUrl(videoUrl);
    setVideoId(videoId);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="relative max-w-7xl w-full">
        {/* Floating bubbles background */}
        <div className="bubbles">
          <div className="bubble" />
          <div className="bubble" />
          <div className="bubble" />
          <div className="bubble" />
        </div>

        {!detectionResults ? (
          /* Upload Page */
          <div className="glass-card relative z-10">
            <div className="mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-2 gradient-heading">
                AI-powered pothole detection and tracking system
              </h1>
              <p className="text-slate-300">
                Real-time video analysis using deep learning to detect potholes and traffic signboards with high accuracy.
              </p>
            </div>

            <VideoUpload onUploadComplete={handleUploadComplete} />
          </div>
        ) : (
          /* Results Page */
          <PotholeDetectionResults
            results={detectionResults}
            videoUrl={videoUrl!}
            videoId={videoId!}
            onBack={() => {
              setDetectionResults(null);
              setVideoUrl(null);
              setVideoId(null);
            }}
          />
        )}
      </div>
    </main>
  );
}
