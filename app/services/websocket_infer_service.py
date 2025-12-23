#app\services\websocket_infer_service.py

import cv2
import asyncio
import time
from app.services.inference_service import YOLOInference
await manager.connect(video_id, websocket)


class WebsocketInference:
    
    
    try:
        # Send initial status if available
        if video_id in processing_status:
            await websocket.send_json({
                "type": "status",
                **processing_status[video_id]
            })
        
        # Keep connection alive
        while True:
            # Wait for any messages from client (ping/pong)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            
    except WebSocketDisconnect:
        manager.disconnect(video_id)