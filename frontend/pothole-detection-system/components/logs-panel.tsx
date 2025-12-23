"use client"

import { useEffect, useRef } from "react"
import { AlertCircle } from "lucide-react"
import type { LogMessage } from "@/app/page"

interface LogsPanelProps {
  logs: LogMessage[]
}

export function LogsPanel({ logs }: LogsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="flex max-h-[520px] flex-col rounded-2xl border border-slate-700/70 bg-slate-900/70 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-slate-700/70 px-6 py-3">
        <AlertCircle className="h-5 w-5 text-slate-300" />
        <h2 className="text-lg font-semibold text-white">Detection Logs</h2>
      </div>
      
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4 text-xs"
        style={{ scrollBehavior: "smooth" }}
      >
        {logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            Waiting for detections...
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="animate-slide-in bg-slate-800/50 rounded-lg border border-slate-700/80 p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                  <span className="font-semibold text-white text-sm">
                    {log.message.includes("pothole") ? "Pothole" : log.message.includes("signboard") ? "Signboard" : "Detection"}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-300">
                {log.videoTimestamp !== undefined ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Video Time</span>
                    <span className="text-white font-mono">
                      {log.videoTimestamp.toFixed(2)}s
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Timestamp</span>
                    <span className="text-white font-mono">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                )}
                
                <div className="pt-1 border-t border-slate-700/50">
                  <p className="text-slate-300">{log.message}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}