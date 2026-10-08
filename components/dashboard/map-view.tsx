"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { HeatPoint } from "@/lib/types";

function getRiskColor(score: number): string {
  if (score >= 80) return "#7f1d1d";
  if (score >= 65) return "#b91c1c";
  if (score >= 45) return "#d97706";
  return "#166534";
}

function computeCenter(points: HeatPoint[]): [number, number] {
  if (!points.length) {
    return [33.4, -86.8];
  }

  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lon = points.reduce((sum, point) => sum + point.lon, 0) / points.length;

  return [lat, lon];
}

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function MapView({ points }: { points: HeatPoint[] }) {
  const center = computeCenter(points);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="overflow-hidden border border-card-border">
      <MapContainer
        center={center}
        zoom={6}
        scrollWheelZoom
        attributionControl={false}
        className="h-[500px] w-full"
      >
        <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} />

        {points.map((point) => (
          <CircleMarker
            key={`${point.siteCode}-${point.lat}-${point.lon}`}
            center={[point.lat, point.lon]}
            radius={Math.max(4, Math.min(22, Math.sqrt(point.deviceCount) * 2.3))}
            pathOptions={{
              color: isDark ? "#475569" : "#111827",
              weight: 1,
              fillColor: getRiskColor(point.riskScoreAvg),
              fillOpacity: 0.75,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">Site {point.siteCode}</div>
                <div>Devices: {point.deviceCount}</div>
                <div>High Risk: {point.highRiskCount}</div>
                <div>Avg Risk Score: {point.riskScoreAvg.toFixed(1)}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
