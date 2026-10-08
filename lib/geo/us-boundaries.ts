import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import countiesAtlasJson from "us-atlas/counties-10m.json";
import statesAtlasJson from "us-atlas/states-10m.json";

type PolygonGeometry = Polygon | MultiPolygon;
type PolygonFeature = Feature<PolygonGeometry, { name?: string }>;

interface CountyBoundaryInternal {
  countyFips: string;
  countyName: string;
  stateFips: string;
  stateCode: string;
  geometry: PolygonGeometry;
  bbox: [number, number, number, number];
}

export interface StateBoundary {
  stateCode: string;
  stateFips: string;
  stateName: string;
  geometry: PolygonGeometry;
}

export interface CountyBoundary {
  countyFips: string;
  countyName: string;
  stateFips: string;
  stateCode: string;
  geometry: PolygonGeometry;
}

interface BoundariesCache {
  states: StateBoundary[];
  countiesByState: Map<string, CountyBoundaryInternal[]>;
}

const STATE_CODE_BY_FIPS = new Map<string, string>([
  ["01", "AL"], ["02", "AK"], ["04", "AZ"], ["05", "AR"], ["06", "CA"], ["08", "CO"], ["09", "CT"], ["10", "DE"],
  ["11", "DC"], ["12", "FL"], ["13", "GA"], ["15", "HI"], ["16", "ID"], ["17", "IL"], ["18", "IN"], ["19", "IA"],
  ["20", "KS"], ["21", "KY"], ["22", "LA"], ["23", "ME"], ["24", "MD"], ["25", "MA"], ["26", "MI"], ["27", "MN"],
  ["28", "MS"], ["29", "MO"], ["30", "MT"], ["31", "NE"], ["32", "NV"], ["33", "NH"], ["34", "NJ"], ["35", "NM"],
  ["36", "NY"], ["37", "NC"], ["38", "ND"], ["39", "OH"], ["40", "OK"], ["41", "OR"], ["42", "PA"], ["44", "RI"],
  ["45", "SC"], ["46", "SD"], ["47", "TN"], ["48", "TX"], ["49", "UT"], ["50", "VT"], ["51", "VA"], ["53", "WA"],
  ["54", "WV"], ["55", "WI"], ["56", "WY"], ["60", "AS"], ["66", "GU"], ["69", "MP"], ["72", "PR"], ["78", "VI"],
]);

const STATE_FIPS_BY_CODE = new Map<string, string>([...STATE_CODE_BY_FIPS.entries()].map(([fips, code]) => [code, fips]));

let cache: BoundariesCache | null = null;

function geometryBbox(geometry: PolygonGeometry): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of rings) {
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

function pointInBbox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function getStateCodeFromFips(stateFips: string): string | null {
  return STATE_CODE_BY_FIPS.get(stateFips) ?? null;
}

function loadBoundaries(): BoundariesCache {
  if (cache) {
    return cache;
  }

  const statesAtlas = statesAtlasJson as {
    objects: { states: unknown };
  };
  const countiesAtlas = countiesAtlasJson as {
    objects: { counties: unknown };
  };

  const stateFeatures = feature(
    statesAtlas as never,
    statesAtlas.objects.states as never,
  ) as unknown as FeatureCollection<PolygonGeometry, { name?: string }>;
  const countyFeatures = feature(
    countiesAtlas as never,
    countiesAtlas.objects.counties as never,
  ) as unknown as FeatureCollection<PolygonGeometry, { name?: string }>;

  const states: StateBoundary[] = stateFeatures.features
    .map((f) => {
      const stateFips = String(f.id ?? "").padStart(2, "0");
      const stateCode = getStateCodeFromFips(stateFips);
      if (!stateCode) {
        return null;
      }

      return {
        stateCode,
        stateFips,
        stateName: f.properties?.name ?? stateCode,
        geometry: f.geometry,
      } satisfies StateBoundary;
    })
    .filter((row): row is StateBoundary => row !== null);

  const countiesByState = new Map<string, CountyBoundaryInternal[]>();
  for (const f of countyFeatures.features as PolygonFeature[]) {
    const countyFips = String(f.id ?? "").padStart(5, "0");
    const stateFips = countyFips.slice(0, 2);
    const stateCode = getStateCodeFromFips(stateFips);
    if (!stateCode) {
      continue;
    }

    const county: CountyBoundaryInternal = {
      countyFips,
      countyName: f.properties?.name ?? countyFips,
      stateFips,
      stateCode,
      geometry: f.geometry,
      bbox: geometryBbox(f.geometry),
    };

    const existing = countiesByState.get(stateCode) ?? [];
    existing.push(county);
    countiesByState.set(stateCode, existing);
  }

  cache = {
    states,
    countiesByState,
  };

  return cache;
}

export function getStateFipsFromCode(stateCode: string): string | null {
  return STATE_FIPS_BY_CODE.get(stateCode.toUpperCase()) ?? null;
}

export function getStateBoundaries(): StateBoundary[] {
  const boundaries = loadBoundaries();
  return boundaries.states;
}

export function getCountyBoundariesForState(stateCode: string): CountyBoundary[] {
  const boundaries = loadBoundaries();
  const rows = boundaries.countiesByState.get(stateCode.toUpperCase()) ?? [];
  return rows.map((county) => ({
    countyFips: county.countyFips,
    countyName: county.countyName,
    stateFips: county.stateFips,
    stateCode: county.stateCode,
    geometry: county.geometry,
  }));
}

export function getCountyFipsForPoint(stateCode: string, lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const boundaries = loadBoundaries();
  const candidates = boundaries.countiesByState.get(stateCode.toUpperCase()) ?? [];
  if (!candidates.length) {
    return null;
  }

  const pt = point([lon, lat]);

  for (const county of candidates) {
    if (!pointInBbox(lat, lon, county.bbox)) {
      continue;
    }

    if (booleanPointInPolygon(pt, county.geometry)) {
      return county.countyFips;
    }
  }

  return null;
}
