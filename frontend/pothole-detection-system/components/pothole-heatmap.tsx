"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "@/app/leaflet-fix";
import { getSeverity } from "@/app/utils/severity";

interface PotholeHeatMapProps {
  lat: number;        // GPS latitude (dummy for now, backend later)
  lng: number;        // GPS longitude (dummy for now, backend later)
  userCount: number;  // number of users reporting potholes at this location
}

export default function PotholeHeatMap({
  lat,
  lng,
  userCount,
}: PotholeHeatMapProps) {
  const severity = getSeverity(userCount);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 mt-6">
      {/* Header */}
      <h2 className="text-xl font-bold text-white mb-1">
        Pothole Crowd Severity Map
      </h2>
      <p className="text-sm text-slate-400 mb-4">
        Severity based on number of users detecting potholes at the same location
      </p>

      {/* REAL INTERACTIVE MAP */}
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        style={{ height: "400px", width: "100%" }}
        scrollWheelZoom={false}   // prevent accidental zoom
        zoomControl={true}        // ✅ SHOW + / − BUTTONS
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* SINGLE LOCATION SEVERITY CIRCLE */}
        <CircleMarker
          center={[lat, lng]}
          radius={severity.radius}
          pathOptions={{
            color: severity.color,
            fillColor: severity.color,
            fillOpacity: 0.6,
          }}
        >
          <Popup>
            <strong>{severity.label}</strong>
            <br />
            Users reported: {userCount}
            <br />
            Location: ({lat}, {lng})
          </Popup>
        </CircleMarker>
      </MapContainer>

      {/* LEGEND */}
      <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          Low (&lt; 5 users)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          Medium (5–9 users)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          High (≥ 10 users)
        </div>
      </div>
    </div>
  );
}