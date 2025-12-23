"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "@/app/leaflet-fix";
import { getSeverity } from "@/app/utils/severity";
import { PotholeLocation } from "@/app/data/pothole-locations";

interface PotholeHeatMapProps {
  locations: PotholeLocation[];
}

export default function PotholeHeatMap({ locations }: PotholeHeatMapProps) {
  // Center map on first location
  const center = [locations[0].lat, locations[0].lng] as [number, number];

  return (
    <div className="h-full w-full">
      <MapContainer
        center={center}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {locations.map((loc, index) => {
          const severity = getSeverity(loc.userCount);

          return (
            <CircleMarker
              key={index}
              center={[loc.lat, loc.lng]}
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
                Users reported: {loc.userCount}
                <br />
                Location: ({loc.lat}, {loc.lng})
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}