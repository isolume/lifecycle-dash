"use client";

import "leaflet/dist/leaflet.css";
import { useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { MapResizeFixer } from "./map-resize-fixer";
import { getRiskColorByPercentile, getRiskColorPalette, MAP_NO_DATA_COLOR } from "@/lib/maps/risk-colors";
import type { StateMapFeature } from "@/lib/types";

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

interface StateRiskMapProps {
  features: StateMapFeature[];
  onStateClick: (stateCode: string) => void;
  selectedState?: string;
}

interface StateGeoJsonProps {
  stateCode: string;
  stateName: string;
  riskScoreAvg: number | null;
  estimatedRefreshCost: number;
  deviceCount: number;
  highRiskCount: number;
}

export type MapMetric = "risk" | "cost";

function formatRisk(value: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No data";
  }

  return value.toFixed(1);
}

function formatCost(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** Percentile rank 0–1 per state (0 = best risk, 1 = worst). Equal counts → equal buckets. */
function useStatePercentiles(features: StateMapFeature[]): Map<string, number> {
  return useMemo(() => {
    const withScore = features
      .filter((f) => f.deviceCount > 0 && typeof f.riskScoreAvg === "number" && !Number.isNaN(f.riskScoreAvg))
      .sort((a, b) => (a.riskScoreAvg! - b.riskScoreAvg!) || a.stateCode.localeCompare(b.stateCode));
    const n = withScore.length;
    const map = new Map<string, number>();
    withScore.forEach((f, i) => map.set(f.stateCode, n > 1 ? (i + 0.5) / n : 0.5));
    return map;
  }, [features]);
}

/** Percentile rank 0–1 per state (0 = lowest cost, 1 = highest cost). */
function useCostPercentiles(features: StateMapFeature[]): Map<string, number> {
  return useMemo(() => {
    const withCost = features
      .filter((f) => f.deviceCount > 0 && f.estimatedRefreshCost >= 0)
      .sort((a, b) => a.estimatedRefreshCost - b.estimatedRefreshCost || a.stateCode.localeCompare(b.stateCode));
    const n = withCost.length;
    const map = new Map<string, number>();
    withCost.forEach((f, i) => map.set(f.stateCode, n > 1 ? (i + 0.5) / n : 0.5));
    return map;
  }, [features]);
}

export function StateRiskMap({ features, onStateClick, selectedState }: StateRiskMapProps) {
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [mapMetric, setMapMetric] = useState<MapMetric>("risk");
  const riskPercentiles = useStatePercentiles(features);
  const costPercentiles = useCostPercentiles(features);
  const percentiles = mapMetric === "risk" ? riskPercentiles : costPercentiles;
  const geoJson = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: features.map((feature): Feature => ({
      type: "Feature",
      id: feature.stateCode,
      geometry: feature.geometry,
      properties: {
        stateCode: feature.stateCode,
        stateName: feature.stateName,
        riskScoreAvg: feature.riskScoreAvg,
        estimatedRefreshCost: feature.estimatedRefreshCost,
        deviceCount: feature.deviceCount,
        highRiskCount: feature.highRiskCount,
      } satisfies StateGeoJsonProps,
    })),
  }), [features]);

  return (
    <div className="relative overflow-hidden border border-card-border">
      <MapContainer center={[39.5, -98.3]} zoom={4} scrollWheelZoom attributionControl={false} className="h-[520px] w-full">
        <MapResizeFixer />
        <TileLayer url={LIGHT_TILES} />
        <GeoJSON
          key={geoJson.features.map((f) => (f as Feature & { id?: string }).id ?? "").join(",")}
          data={geoJson}
          style={(feature) => {
            const props = (feature?.properties ?? {}) as StateGeoJsonProps;
            const hasData = props.deviceCount > 0;
            const isSelected = selectedState === props.stateCode;
            const isHovered = hasData && hoveredStateCode === props.stateCode;

            const HOVER_BLUE = "#3b82f6";
            return {
              color: isSelected ? "#111827" : isHovered ? HOVER_BLUE : "#475569",
              weight: isSelected ? 2.5 : isHovered ? 2.2 : 1,
              fillColor: hasData ? getRiskColorByPercentile(percentiles.get(props.stateCode) ?? 0.5) : MAP_NO_DATA_COLOR,
              fillOpacity: hasData ? 0.85 : 0.55,
              opacity: 0.95,
            };
          }}
          onEachFeature={(feature, layer) => {
            const props = (feature.properties ?? {}) as StateGeoJsonProps;
            const hasData = props.deviceCount > 0;

            if (hasData) {
              layer.bindTooltip(
                `<div style="font-size:12px"><strong>${props.stateName}</strong><br/>Avg Risk: ${formatRisk(props.riskScoreAvg)}<br/>Est. Cost: ${formatCost(props.estimatedRefreshCost)}<br/>Devices: ${props.deviceCount}<br/>High Risk: ${props.highRiskCount}</div>`,
                { direction: "right", offset: [12, 0] },
              );
              layer.on("mouseover", () => setHoveredStateCode(props.stateCode));
              layer.on("mouseout", () => setHoveredStateCode(null));
              layer.on("click", () => onStateClick(props.stateCode));
            }
            // no-data states: no tooltip, no hover, no click
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
