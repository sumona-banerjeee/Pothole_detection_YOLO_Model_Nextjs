# app/services/video_processor.py

import cv2
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from collections import defaultdict, deque
from fastapi import HTTPException
from ultralytics import YOLO
from concurrent.futures import ThreadPoolExecutor

from app.ws.websocket_manager import manager
from app.core.storage import processing_status, detection_results, RESULTS_DIR

logger = logging.getLogger(__name__)

TRACKER = "bytetrack.yaml"
MIN_DETECTION_FRAMES = 3
DETECTION_TIME_WINDOW = 1.0
FRAME_STEP = 2  # process every 2nd frame - HUGE speed gain
MAX_STORED_FRAMES = 1500  # Prevent memory explosion on long videos

# Create a thread pool for blocking operations
executor = ThreadPoolExecutor(max_workers=4)


class VideoProcessor:
    def __init__(self):
        """Initialize video processor with YOLO model"""
        try:
            self.pothole_model = YOLO("models/pothole-detector.pt")
            logger.info("Pothole detection model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise

    @staticmethod
    def get_adaptive_params(speed):
        """Get adaptive parameters based on speed"""
        if speed < 30:
            return {
                "roi_ratio": 0.50,
                "pothole_conf": 0.35,
                "description": "Low Speed - Focused ROI",
            }
        elif speed < 60:
            return {
                "roi_ratio": 0.65,
                "pothole_conf": 0.28,
                "description": "Medium Speed - Moderate ROI",
            }
        else:
            return {
                "roi_ratio": 0.75,
                "pothole_conf": 0.22,
                "description": "High Speed - Extended ROI",
            }

    def detect_frame_with_roi(
        self,
        frame,
        frame_id,
        results_log,
        pothole_tracker,
        confirmed_potholes,
        current_time,
        speed_kmh,
    ):
        """
        Run pothole detection with adaptive ROI and tracking to avoid duplicate counts.
        Returns detection data and counts for unique potholes.

        NOTE: bbox is stored in FULL-FRAME pixel coordinates, matching original video
        resolution (video_width x video_height). Frontend should use video_info.width/
        height as canvas width/height and draw bboxes directly without scaling.
        """
        h, w = frame.shape[:2]
        params = self.get_adaptive_params(speed_kmh)

        # Calculate ROI boundary (bottom region of frame)
        roi_y_start = int(h * (1 - params["roi_ratio"]))
        roi_frame = frame[roi_y_start:h, :]

        pothole_detections = []
        current_frame_potholes = 0
        new_potholes_count = 0

        try:
            # -------- POTHOLE DETECTION WITH TRACKING (ROI ONLY) --------
            pothole_results = self.pothole_model.track(
                roi_frame,
                conf=params["pothole_conf"],
                tracker=TRACKER,
                persist=True,
                verbose=False,
            )

            for r in pothole_results:
                if r.boxes is not None and len(r.boxes) > 0:
                    boxes = r.boxes.xyxy.cpu().numpy()
                    confs = r.boxes.conf.cpu().numpy()

                    # Check if tracking IDs are available
                    if r.boxes.id is not None:
                        ids = r.boxes.id.cpu().numpy()

                        for box, track_id, conf in zip(boxes, ids, confs):
                            x1, y1, x2, y2 = map(int, box)
                            track_id = int(track_id)

                            # Convert ROI coordinates to FULL FRAME coordinates
                            y1_full = y1 + roi_y_start
                            y2_full = y2 + roi_y_start

                            # Add to tracking history
                            pothole_tracker[track_id].append(current_time)

                            # Check if pothole is confirmed (seen enough times)
                            recent_detections = [
                                t
                                for t in pothole_tracker[track_id]
                                if current_time - t <= DETECTION_TIME_WINDOW
                            ]

                            is_confirmed = len(recent_detections) >= MIN_DETECTION_FRAMES

                            # If newly confirmed, increment unique count
                            if is_confirmed and track_id not in confirmed_potholes:
                                confirmed_potholes[track_id] = {
                                    "first_seen_frame": frame_id,
                                    "first_seen_time": current_time,
                                    "confidence": conf,
                                }
                                new_potholes_count = 1

                            # ✅ ONLY STORE CONFIRMED POTHOLES (CRITICAL)
                            if track_id in confirmed_potholes:
                                current_frame_potholes += 1

                                # Store detection data (FULL-FRAME PIXELS)
                                detection = {
                                    "frame_id": frame_id,          # 1-based index
                                    "pothole_id": track_id,
                                    "type": "pothole",
                                    "confidence": round(float(conf), 3),
                                    "bbox": {
                                        "x1": x1,
                                        "y1": y1_full,
                                        "x2": x2,
                                        "y2": y2_full,
                                    },
                                    "center": {
                                        "x": int((x1 + x2) / 2),
                                        "y": int((y1_full + y2_full) / 2),
                                    },
                                    "area": (x2 - x1) * (y2_full - y1_full),
                                }
                                pothole_detections.append(detection)

                    else:
                        # No tracking available - use basic detection without IDs
                        # ✅ Skip storing untracked detections to save memory
                        for box, conf in zip(boxes, confs):
                            x1, y1, x2, y2 = map(int, box)

                            # Convert ROI coordinates to FULL FRAME coordinates
                            y1_full = y1 + roi_y_start
                            y2_full = y2 + roi_y_start

                            current_frame_potholes += 1

                            # Store detection data (FULL-FRAME PIXELS) - ONLY CONFIRMED
                            detection = {
                                "frame_id": frame_id,
                                "pothole_id": None,
                                "type": "pothole",
                                "confidence": round(float(conf), 3),
                                "bbox": {
                                    "x1": x1,
                                    "y1": y1_full,
                                    "x2": x2,
                                    "y2": y2_full,
                                },
                                "center": {
                                    "x": int((x1 + x2) / 2),
                                    "y": int((y1_full + y2_full) / 2),
                                },
                                "area": (x2 - x1) * (y2_full - y1_full),
                            }
                            # ✅ CRITICAL: Only store if confirmed (skip untracked for now)
                            # pothole_detections.append(detection)  # COMMENTED OUT

            # Log results - store frame data ONLY if there are CONFIRMED detections
            if pothole_detections:
                results_log["frames"].append(
                    {
                        "frame_id": frame_id,
                        "speed_kmh": speed_kmh,
                        "roi_ratio": params["roi_ratio"],
                        "potholes": pothole_detections,
                    }
                )

                # ✅ Limit stored frames to prevent memory explosion
                if len(results_log["frames"]) > MAX_STORED_FRAMES:
                    results_log["frames"].pop(0)

        except Exception as e:
            logger.error(f"Error in frame detection: {str(e)}")

        return current_frame_potholes, new_potholes_count

    def _process_video_blocking(self, video_id: str, video_path: str, speed_kmh: int, loop):
        """
        Blocking video processing function that runs in a separate thread.
        Uses asyncio.run_coroutine_threadsafe to send WebSocket updates.
        """
        try:
            # Send initial status
            asyncio.run_coroutine_threadsafe(
                manager.send_message(
                    video_id,
                    {
                        "type": "status",
                        "status": "processing",
                        "progress": 0,
                        "message": "Loading model...",
                    },
                ),
                loop,
            )

            # Open video
            cap = cv2.VideoCapture(video_path)

            if not cap.isOpened():
                raise Exception("Could not open video")

            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            logger.info(
                f"Processing video {video_id}: {total_frames} frames @ {fps} FPS, "
                f"Resolution: {video_width}x{video_height}"
            )

            asyncio.run_coroutine_threadsafe(
                manager.send_message(
                    video_id,
                    {
                        "type": "status",
                        "status": "processing",
                        "progress": 5,
                        "message": f"Model loaded, processing every {FRAME_STEP}th frame...",
                    },
                ),
                loop,
            )

            # Initialize results log structure
            results_log = {
                "video_path": video_path,
                "speed_kmh": speed_kmh,
                "frames": [],
                "summary": {},
            }

            # Initialize tracking
            pothole_tracker = defaultdict(lambda: deque(maxlen=20))
            confirmed_potholes = {}
            total_detections = 0

            frame_count = 0
            processed_frame_count = 0
            last_progress = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1

                # ✅ SKIP FRAMES - HUGE SPEED GAIN (50% reduction)
                if frame_count % FRAME_STEP != 0:
                    continue

                processed_frame_count += 1
                current_time = frame_count / fps if fps > 0 else 0.0

                # Detect potholes (blocking operation)
                n_potholes, new_potholes = self.detect_frame_with_roi(
                    frame,
                    frame_count,  # Use actual frame number (not processed frame count)
                    results_log,
                    pothole_tracker,
                    confirmed_potholes,
                    current_time,
                    speed_kmh,
                )

                total_detections += n_potholes

                # Send progress updates (every 5% based on PROCESSED frames)
                current_progress = int((processed_frame_count / (total_frames / FRAME_STEP)) * 95) + 5
                if current_progress - last_progress >= 5:
                    processing_status[video_id]["progress"] = current_progress
                    asyncio.run_coroutine_threadsafe(
                        manager.send_message(
                            video_id,
                            {
                                "type": "progress",
                                "progress": current_progress,
                                "message": f"Frame {frame_count}/{total_frames} ({processed_frame_count} processed)",
                                "unique_potholes": len(confirmed_potholes),
                                "total_detections": total_detections,
                            },
                        ),
                        loop,
                    )
                    last_progress = current_progress

            cap.release()

            # Create pothole list
            pothole_list = []
            for ph_id, info in confirmed_potholes.items():
                pothole_list.append(
                    {
                        "pothole_id": int(ph_id),
                        "first_detected_frame": info["first_seen_frame"],
                        "first_detected_time": round(info["first_seen_time"], 2),
                        "confidence": round(float(info["confidence"]), 3),
                    }
                )

            # Sort by first detection frame
            pothole_list.sort(key=lambda x: x["first_detected_frame"])

            # Prepare summary
            results_log["summary"] = {
                "total_frames": frame_count,
                "processed_frames": processed_frame_count,
                "frame_step": FRAME_STEP,
                "unique_potholes": len(confirmed_potholes),
                "total_detections": total_detections,
                "frames_with_detections": len(results_log["frames"]),
                "detection_rate": round(
                    len(results_log["frames"]) / processed_frame_count * 100, 2
                ) if processed_frame_count > 0 else 0,
            }

            results_log["pothole_list"] = pothole_list

            # Add video metadata – THIS IS WHAT FRONTEND MUST USE FOR CANVAS/FPS
            results = {
                "video_id": video_id,
                "video_path": video_path,
                "speed_kmh": speed_kmh,
                "processed_at": datetime.now().isoformat(),
                "video_info": {
                    "total_frames": total_frames,
                    "fps": round(float(fps), 2),
                    "duration": round(total_frames / fps, 2) if fps > 0 else 0,
                    "width": video_width,
                    "height": video_height,
                    "resolution": f"{video_width}x{video_height}",
                },
                "summary": results_log["summary"],
                "pothole_list": pothole_list,
                "frames": results_log["frames"],
            }

            # Save results to memory and file
            detection_results[video_id] = results

            result_file = RESULTS_DIR / f"{video_id}.json"
            with open(result_file, "w") as f:
                json.dump(results, f, indent=2)

            logger.info(
                f"Processing completed for {video_id}: {len(confirmed_potholes)} "
                f"unique potholes detected, {total_detections} total detections "
                f"(processed {processed_frame_count}/{frame_count} frames)"
            )

            # Update status
            processing_status[video_id] = {
                "status": "completed",
                "progress": 100,
                "message": "Processing completed successfully",
            }

            asyncio.run_coroutine_threadsafe(
                manager.send_message(
                    video_id,
                    {
                        "type": "complete",
                        "status": "completed",
                        "progress": 100,
                        "message": "Processing completed successfully",
                        "summary": results["summary"],
                    },
                ),
                loop,
            )

            return results

        except Exception as e:
            logger.error(f"Error processing video {video_id}: {str(e)}")

            processing_status[video_id] = {
                "status": "error",
                "progress": 0,
                "message": f"Error: {str(e)}",
            }

            asyncio.run_coroutine_threadsafe(
                manager.send_message(
                    video_id,
                    {
                        "type": "error",
                        "status": "error",
                        "message": f"Processing failed: {str(e)}",
                    },
                ),
                loop,
            )

            raise

    async def process_video(self, video_id: str, video_path: str, speed_kmh: int):
        """
        Async wrapper that offloads blocking video processing to a thread pool.
        This keeps the FastAPI event loop free for WebSocket and HTTP requests.
        """
        try:
            processing_status[video_id] = {
                "status": "processing",
                "progress": 0,
                "message": "Starting processing...",
            }

            # Get current event loop
            loop = asyncio.get_event_loop()

            # Run blocking operation in thread pool
            await loop.run_in_executor(
                executor,
                self._process_video_blocking,
                video_id,
                video_path,
                speed_kmh,
                loop,
            )

        except Exception as e:
            logger.error(f"Error in process_video wrapper: {str(e)}")
            processing_status[video_id] = {
                "status": "error",
                "progress": 0,
                "message": f"Error: {str(e)}",
            }

    async def get_status(self, video_id: str):
        """Get current processing status"""
        if video_id not in processing_status:
            raise HTTPException(status_code=404, detail="Video ID not found")

        return processing_status[video_id]

    async def get_results(self, video_id: str):
        """Get detection results for a processed video"""
        if video_id not in detection_results:
            # Try loading from file
            result_file = RESULTS_DIR / f"{video_id}.json"
            if result_file.exists():
                with open(result_file, "r") as f:
                    detection_results[video_id] = json.load(f)
            else:
                raise HTTPException(
                    status_code=404,
                    detail="Results not found. Video may still be processing.",
                )

        return detection_results[video_id]