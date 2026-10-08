"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { MapResizeFixer } from "./map-resize-fixer";
import { getRiskColorByPercentile, getRiskColorPalette, MAP_NO_DATA_COLOR } from "@/lib/maps/risk-colors";
import type { CountyMapFeature } from "@/lib/types";

export type MapMetric = "risk" | "cost";

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

interface StateCountyMapProps {
  counties: CountyMapFeature[];
  onCountyClick: (countyFips: string) => void;
}

interface CountyGeoJsonProps {
  countyFips: string;
  countyName: string;
  riskScoreAvg: number | null;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

type BBox = [number, number, number, number];

function computeGeometryBboxCoordinates(coords: Position[][][]): BBox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of coords) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return [minLon, minLat, maxLon, maxLat];
}

function bboxFromFeatureCollection(collection: FeatureCollection<Polygon | MultiPolygon, CountyGeoJsonProps>): BBox | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of collection.features) {
    if (!feature.geometry) {
      continue;
    }

    const geometry = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

    const [gMinLon, gMinLat, gMaxLon, gMaxLat] = computeGeometryBboxCoordinates(geometry);
    minLon = Math.min(minLon, gMinLon);
    minLat = Math.min(minLat, gMinLat);
    maxLon = Math.max(maxLon, gMaxLon);
    maxLat = Math.max(maxLat, gMaxLat);
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
}

function BoundsFitter({ bounds }: { bounds: BBox | null }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) {
      return;
    }

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

function formatRisk(value: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No data";
  }

  return value.toFixed(1);
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** Percentile rank 0–1 per county (0 = best risk, 1 = worst). */
function useCountyRiskPercentiles(counties: CountyMapFeature[]): Map<string, number> {
  return useMemo(() => {
    const withScore = counties
      .filter((c) => c.deviceCount > 0 && typeof c.riskScoreAvg === "number" && !Number.isNaN(c.riskScoreAvg))
      .sort((a, b) => (a.riskScoreAvg! - b.riskScoreAvg!) || a.countyFips.localeCompare(b.countyFips));
    const n = withScore.length;
    const map = new Map<string, number>();
    withScore.forEach((c, i) => map.set(c.countyFips, n > 1 ? (i + 0.5) / n : 0.5));
    return map;
  }, [counties]);
}

/** Percentile rank 0–1 per county (0 = lowest cost, 1 = highest cost). */
function useCountyCostPercentiles(counties: CountyMapFeature[]): Map<string, number> {
  return useMemo(() => {
    const withCost = counties
      .filter((c) => c.deviceCount > 0 && c.estimatedRefreshCost >= 0)
      .sort((a, b) => a.estimatedRefreshCost - b.estimatedRefreshCost || a.countyFips.localeCompare(b.countyFips));
    const n = withCost.length;
    const map = new Map<string, number>();
    withCost.forEach((c, i) => map.set(c.countyFips, n > 1 ? (i + 0.5) / n : 0.5));
    return map;
  }, [counties]);
}

export function StateCountyMap({ counties, onCountyClick }: StateCountyMapProps) {
  const [mapMetric, setMapMetric] = useState<MapMetric>("risk");
  const riskPercentiles = useCountyRiskPercentiles(counties);
  const costPercentiles = useCountyCostPercentiles(counties);
  const percentiles = mapMetric === "risk" ? riskPercentiles : costPercentiles;
  const geoJson = useMemo<FeatureCollection<Polygon | MultiPolygon, CountyGeoJsonProps>>(() => ({
    type: "FeatureCollection",
    features: counties.map((county): Feature<Polygon | MultiPolygon, CountyGeoJsonProps> => ({
      type: "Feature",
      geometry: county.geometry,
      properties: {
        countyFips: county.countyFips,
        countyName: county.countyName,
        riskScoreAvg: county.riskScoreAvg,
        deviceCount: county.deviceCount,
        highRiskCount: county.highRiskCount,
        estimatedRefreshCost: county.estimatedRefreshCost,
      } satisfies CountyGeoJsonProps,
    })),
  }), [counties]);

  const bounds = useMemo(() => bboxFromFeatureCollection(geoJson), [geoJson]);
  const geoJsonKey = useMemo(
    () => counties.map((county) => `${county.countyFips}:${county.deviceCount}:${county.riskScoreAvg ?? "na"}:${mapMetric}`).join("|"),
    [counties, mapMetric],
  );

  return (
    <div className="relative overflow-hidden border border-card-border">
      <MapContainer center={[33.4, -86.8]} zoom={7} scrollWheelZoom attributionControl={false} className="h-[560px] w-full">
        <MapResizeFixer />
        <TileLayer url={LIGHT_TILES} />
        <BoundsFitter bounds={bounds} />
        <GeoJSON
          key={geoJsonKey}
          data={geoJson}
          style={(feature) => {
            const props = (feature?.properties ?? {}) as CountyGeoJsonProps;
            const hasData = props.deviceCount > 0;

            return {
              color: "#334155",
              weight: 1,
              fillColor: hasData ? getRiskColorByPercentile(percentiles.get(props.countyFips) ?? 0.5) : MAP_NO_DATA_COLOR,
              fillOpacity: hasData ? 0.82 : 0.5,
              opacity: 1,
            };
          }}
          onEachFeature={(feature, layer) => {
            const props = (feature.properties ?? {}) as CountyGeoJsonProps;
            const hasData = props.deviceCount > 0;

            layer.bindTooltip(
              `<div style="font-size:12px"><strong>${props.countyName}</strong><br/>Avg Risk: ${formatRisk(props.riskScoreAvg)}<br/>Est. Cost: ${formatCost(props.estimatedRefreshCost)}<br/>Devices: ${props.deviceCount}<br/>High Risk: ${props.highRiskCount}</div>`,
            );

            if (hasData) {
              layer.on("click", () => onCountyClick(props.countyFips));
            }
          }}
        />
      </MapContainer>

      <div className="pointer-events-none absolute bottom-1 right-1 z-[1000] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex border border-card-border bg-card-bg shadow">
          <button
            type="button"
            onClick={() => setMapMetric("risk")}
            className={`rounded-l-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mapMetric === "risk" ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:bg-foreground/5"}`}
          >
            Risk
          </button>
          <button
            type="button"
            onClick={() => setMapMetric("cost")}
            className={`rounded-r-md border-l border-card-border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${mapMetric === "cost" ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:bg-foreground/5"}`}
          >
            Cost
          </button>
        </div>
        <div className="border border-card-border bg-card-bg p-3 text-[11px] shadow">
          <div className="mb-2 font-semibold text-foreground/70">
            {mapMetric === "risk" ? "Risk (red = worse)" : "Cost (red = higher)"}
          </div>
          <div className="flex items-center gap-0.5">
            {getRiskColorPalette().map((color) => (
              <span
                key={color}
                className="h-3 w-4 rounded-sm border border-black/15"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-foreground/60">
            <span>{mapMetric === "risk" ? "Best" : "Low"}</span>
            <span>{mapMetric === "risk" ? "Worst" : "High"}</span>
          </div>
          <div className="mt-1 text-foreground/50">Gray = no data</div>
        </div>
      </div>
    </div>
  );
}
