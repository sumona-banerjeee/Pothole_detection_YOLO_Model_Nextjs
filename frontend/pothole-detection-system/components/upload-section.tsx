"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Upload, Loader2 } from "lucide-react"
import type { DetectionData } from "@/app/page"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1"

type UploadSectionProps = {
  onDetectionComplete: (data: DetectionData, file: File) => void
}

export function UploadSection({ onDetectionComplete }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null)
  const [speed, setSpeed] = useState(30)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const connectWebSocket = (videoId: string) => {
    console.log("[v0] Connecting WebSocket for video:", videoId)

    const ws = new WebSocket(`${WS_URL}/ws/${videoId}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[v0] WebSocket connected")
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log("[v0] WebSocket message:", data)

      if (data.type === "progress" || data.progress !== undefined) {
        const progressValue = data.progress || 0
        setProgress(progressValue)

        let message = data.message || "Processing..."
        if (data.unique_potholes !== undefined) {
          message += ` | Unique: ${data.unique_potholes} | Total: ${data.total_detections || 0}`
        }
        setStatusMessage(message)
      }

      if (data.type === "complete" || data.status === "completed") {
        setStatusMessage("Processing completed! Loading results...")
        ws.close()
        setTimeout(() => loadResults(videoId), 500)
      }

      if (data.type === "error") {
        setStatusMessage("Error: " + data.message)
        setUploading(false)
        ws.close()
      }
    }

    ws.onerror = (error) => {
      console.error("[v0] WebSocket error:", error)
      setStatusMessage("Connection error. Retrying...")
    }

    ws.onclose = () => {
      console.log("[v0] WebSocket closed")
    }
  }

  const loadResults = async (videoId: string) => {
    try {
      console.log("[v0] Loading results for:", videoId)
      const response = await fetch(`${API_URL}/results/${videoId}`)
      console.log("[v0] Results response:", response)

      if (!response.ok) {
        throw new Error(`Failed to load results: ${response.status}`)
      }

      const detectionData: DetectionData = await response.json()
      console.log("[v0] Results loaded:", detectionData)

      setUploading(false)
      setStatusMessage("✓ Complete!")

      if (file) {
        onDetectionComplete(detectionData, file)
      }
    } catch (error) {
      console.error("[v0] Failed to load results:", error)
      setStatusMessage("Failed to load results. Please try again.")
      setUploading(false)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a video file")
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("speed_kmh", speed.toString())

    setUploading(true)
    setProgress(0)
    setStatusMessage("Uploading...")

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const result = await response.json()
      console.log("[v0] Upload response:", result)
      const videoId = result.video_id

      console.log("[v0] Video uploaded, ID:", videoId)
      setStatusMessage("Uploaded! Processing...")

      // Connect WebSocket for progress updates
      connectWebSocket(videoId)
    } catch (error) {
      console.error("[v0] Upload error:", error)
      setStatusMessage("Upload failed: " + (error as Error).message)
      setUploading(false)
    }
  }

  return (
    <Card className="transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle>Upload Video</CardTitle>
        <CardDescription>Select a video file and vehicle speed to start pothole detection</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="video-file">Video File</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={uploading}
                className="flex-1"
              />
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Speed Input */}
          <div className="space-y-2">
            <Label htmlFor="speed">Vehicle Speed (km/h)</Label>
            <Input
              id="speed"
              type="number"
              min={1}
              max={200}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              disabled={uploading}
            />
          </div>
        </div>

        {/* Upload Button */}
        <Button onClick={handleUpload} disabled={!file || uploading} className="w-full transition-all" size="lg">
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Process
            </>
          )}
        </Button>

        {/* Progress Section */}
        {uploading && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top duration-500">
            <Progress value={progress} className="h-3 transition-all duration-300" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{statusMessage}</span>
              <span className="font-semibold">{progress}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
