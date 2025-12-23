"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "@/app/leaflet-fix";
import { dummyPotholeData } from "@/app/data/dummyPotholeData";
import { getSeverity } from "@/app/utils/severity";

export default function PotholeHeatMap() {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 mt-6">
      <h2 className="text-xl font-bold text-white mb-4">
        Pothole Severity Map (Dummy Data)
      </h2>

      <MapContainer
        center={[28.6139, 77.2090]}
        zoom={15}
        style={{ height: "400px", width: "100%" }}
        dragging={false}
        scrollWheelZoom={false}
        zoomControl={false}
        doubleClickZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {dummyPotholeData.map((location) => {
          const severity = getSeverity(location.reportCount);

          return (
            <CircleMarker
              key={location.id}
              center={[location.lat, location.lng]}
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
                Reports: {location.reportCount}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* LEGEND */}
      <div className="mt-4 flex gap-6 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          Low (&lt; 5 users)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded-full" />
          Medium (5–9 users)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          High (≥ 10 users)
        </div>
      </div>
    </div>
  );
}
