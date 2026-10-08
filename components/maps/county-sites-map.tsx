"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { MapResizeFixer } from "./map-resize-fixer";
import { getRiskColor } from "@/lib/maps/risk-colors";
import type { CountySiteMarker } from "@/lib/types";

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

type BBox = [number, number, number, number];

interface CountySitesMapProps {
  countyName: string;
  countyGeometry: Polygon | MultiPolygon;
  sites: CountySiteMarker[];
  onSiteClick: (siteCode: string) => void;
}

function bboxFromGeometry(geometry: Polygon | MultiPolygon): BBox {
  const coords = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of coords) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring as Position[]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return [minLon, minLat, maxLon, maxLat];
}

function MapBoundsFitter({ bounds }: { bounds: BBox }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]],
      ],
      { padding: [20, 20] },
    );
  }, [bounds, map]);

  return null;
}

export function CountySitesMap({ countyName, countyGeometry, sites, onSiteClick }: CountySitesMapProps) {
  const countyGeoJson = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: countyGeometry,
        properties: {
          countyName,
        },
      } satisfies Feature,
    ],
  }), [countyGeometry, countyName]);

  const bounds = useMemo(() => bboxFromGeometry(countyGeometry), [countyGeometry]);
  const countyLayerKey = useMemo(() => `${countyName}:${sites.length}`, [countyName, sites.length]);

  return (
    <div className="overflow-hidden border border-card-border">
      <MapContainer center={[33.4, -86.8]} zoom={10} scrollWheelZoom attributionControl={false} className="h-[560px] w-full">
        <MapResizeFixer />
        <TileLayer url={LIGHT_TILES} />
        <MapBoundsFitter bounds={bounds} />
        <GeoJSON
          key={countyLayerKey}
          data={countyGeoJson}
          style={() => ({
            color: "#1f2937",
            weight: 2,
            fillColor: "#f8fafc",
            fillOpacity: 0.15,
          })}
        />

        {sites.map((site) => (
          <CircleMarker
            key={site.siteCode}
            center={[site.lat, site.lon]}
            radius={Math.max(5, Math.min(20, Math.sqrt(site.deviceCount) * 2.3))}
            pathOptions={{
              color: "#1f2937",
              weight: 1,
              fillColor: getRiskColor(site.riskScoreAvg),
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{site.siteName || site.siteCode}</div>
                <div className="text-xs text-foreground/60">Site Code: {site.siteCode}</div>
                <div>Avg Risk: {site.riskScoreAvg.toFixed(1)}</div>
                <div>Devices: {site.deviceCount}</div>
                <div>High Risk: {site.highRiskCount}</div>
                <button
                  type="button"
                  onClick={() => onSiteClick(site.siteCode)}
                  className="btn btn-primary btn-sm mt-2"
                >
                  More information
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
