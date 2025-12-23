"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Upload, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { DetectionResults } from "@/app/page"

interface VideoUploadProps {
  onUploadComplete: (results: DetectionResults, videoUrl: string, videoId: string) => void
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const videoFileRef = useRef<File | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      videoFileRef.current = file
      setError(null)
      console.log("File selected:", file.name, file.size, "bytes")
    }
  }

  const pollStatus = async (videoId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/status/${videoId}`)
      
      if (!response.ok) {
        console.error("Status check failed:", response.statusText)
        return
      }

      const statusData = await response.json()
      console.log("Status update:", statusData)
      
      if (statusData.progress !== undefined) {
        setProgress(Math.round(statusData.progress))
      }
      
      if (statusData.status) {
        setStatusMessage(statusData.status)
      }

      if (statusData.unique_potholes !== undefined) {
        setStatusMessage(`Processing... Found ${statusData.unique_potholes} potholes`)
      }

      if (statusData.status === "completed" || statusData.progress === 100) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
        }
        await fetchResults(videoId)
      }
    } catch (err) {
      console.error("Error polling status:", err)
    }
  }

  const fetchResults = async (videoId: string) => {
    try {
      console.log("Fetching results for video ID:", videoId)
      setStatusMessage("Loading results...")
      
      const response = await fetch(`${API_BASE_URL}/api/v1/results/${videoId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch results: ${response.status} ${response.statusText}`)
      }

      const results: DetectionResults = await response.json()
      console.log("Results received:", results)
      
      // Check if we have frames and detections
      if (!results.frames || results.frames.length === 0) {
        console.warn("No frames in results!")
      } else {
        console.log(`Received ${results.frames.length} frames`)
        const framesWithDetections = results.frames.filter(f => f.potholes && f.potholes.length > 0)
        console.log(`Frames with detections: ${framesWithDetections.length}`)
      }
      
      // Try multiple video URL patterns
      let videoUrl = ""
      
      // Pattern 1: Direct video_path from results
      if (results.video_path) {
        videoUrl = `${API_BASE_URL}/videos/${results.video_path}`
        console.log("Trying video URL (from video_path):", videoUrl)
      } else {
        // Pattern 2: Try uploads directory
        videoUrl = `${API_BASE_URL}/videos/uploads/${videoId}.mp4`
        console.log("Trying video URL (uploads):", videoUrl)
      }
      
      // Verify video URL is accessible
      try {
        const videoCheck = await fetch(videoUrl, { method: 'HEAD' })
        if (!videoCheck.ok) {
          console.error("Video not accessible at:", videoUrl)
          // If we have the original file, create a blob URL
          if (videoFileRef.current) {
            videoUrl = URL.createObjectURL(videoFileRef.current)
            console.log("Using blob URL from original file")
          } else {
            throw new Error(`Video file not found at: ${videoUrl}`)
          }
        }
      } catch (err) {
        console.error("Error checking video URL:", err)
        if (videoFileRef.current) {
          videoUrl = URL.createObjectURL(videoFileRef.current)
          console.log("Fallback: Using blob URL from original file")
        }
      }
      
      setStatusMessage("✓ Processing complete!")
      setProcessing(false)
      setUploading(false)
      
      console.log("Calling onUploadComplete with:", { 
        videoUrl, 
        videoId, 
        summaryPotholes: results.summary?.unique_potholes,
        framesCount: results.frames?.length 
      })
      
      onUploadComplete(results, videoUrl, videoId)
      
    } catch (err) {
      console.error("Error fetching results:", err)
      setError(err instanceof Error ? err.message : "Failed to load results")
      setProcessing(false)
      setUploading(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a video file")
      return
    }

    setUploading(true)
    setProcessing(true)
    setProgress(0)
    setError(null)
    setStatusMessage("Uploading video...")

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("speed_kmh", "80")

      console.log("Uploading file:", selectedFile.name)

      const uploadResponse = await fetch(`${API_BASE_URL}/api/v1/upload`, {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`)
      }

      const uploadData = await uploadResponse.json()
      const videoId = uploadData.video_id

      console.log("Video uploaded successfully. ID:", videoId)
      console.log("Upload response:", uploadData)
      
      setStatusMessage("Video uploaded! Processing...")
      setUploading(false)
      setProgress(10)

      // Try WebSocket connection
      try {
        const wsUrl = `ws://localhost:8000/api/v1/ws/${videoId}`
        console.log("Connecting to WebSocket:", wsUrl)
        
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        let wsConnected = false

        ws.onopen = () => {
          console.log("✓ WebSocket connected")
          wsConnected = true
          setStatusMessage("Processing video...")
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log("WebSocket message:", data)
            
            if (data.progress !== undefined) {
              setProgress(Math.round(data.progress))
            }
            
            if (data.status) {
              setStatusMessage(data.status)
            }

            if (data.unique_potholes !== undefined) {
              setStatusMessage(`Processing... Found ${data.unique_potholes} potholes (${data.total_detections} total detections)`)
            }

            if (data.status === "completed" || data.progress === 100) {
              console.log("Processing completed via WebSocket")
              ws.close()
              setTimeout(() => fetchResults(videoId), 500)
            }
            
            if (data.type === "error") {
              console.error("WebSocket error message:", data.message)
              setError(data.message)
              ws.close()
              setProcessing(false)
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err)
          }
        }

        ws.onerror = (error) => {
          console.error("WebSocket error:", error)
          if (!wsConnected) {
            setStatusMessage("Processing... (using status polling)")
            startPolling(videoId)
          }
        }

        ws.onclose = () => {
          console.log("WebSocket closed")
          if (!wsConnected) {
            startPolling(videoId)
          }
        }

        // Fallback to polling after 3 seconds if no WebSocket messages
        setTimeout(() => {
          if (!wsConnected || progress < 15) {
            console.log("WebSocket timeout, falling back to polling")
            startPolling(videoId)
          }
        }, 3000)

      } catch (wsError) {
        console.error("WebSocket connection failed:", wsError)
        startPolling(videoId)
      }

    } catch (err) {
      console.error("Upload error:", err)
      setError(err instanceof Error ? err.message : "Upload failed")
      setUploading(false)
      setProcessing(false)
    }
  }

  const startPolling = (videoId: string) => {
    console.log("Starting status polling for:", videoId)
    setStatusMessage("Processing... (polling for updates)")
    
    pollIntervalRef.current = setInterval(() => {
      pollStatus(videoId)
    }, 2000)
    
    // Also poll immediately
    pollStatus(videoId)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 backdrop-blur-sm p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-white mb-2">Upload Video</h2>
        <p className="text-sm text-slate-400">
          Select a video file to analyze for potholes and traffic signboards
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            disabled={uploading || processing}
            onClick={() => document.getElementById("video-input")?.click()}
            className="relative rounded-full bg-gradient-to-r from-[#7C83FF] to-[#5EEAD4] px-6 py-2.5 text-sm font-semibold text-black shadow-lg hover:from-[#8B8FFF] hover:to-[#6EF0DD] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Choose Video
              </>
            )}
          </Button>

          <input
            id="video-input"
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || processing}
          />

          {selectedFile && !processing && (
            <div className="text-sm text-slate-300">
              Selected: <span className="font-semibold">{selectedFile.name}</span>
              {" "}({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
        </div>

        {selectedFile && !uploading && !processing && (
          <Button
            onClick={handleUpload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Start Processing
          </Button>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {(uploading || processing) && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top duration-500">
            <Progress value={progress} className="h-3 transition-all duration-300" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{statusMessage}</span>
              <span className="font-semibold text-white">{progress}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}