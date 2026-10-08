import type { MultiPolygon, Polygon } from "geojson";

export interface DashboardFilters {
  states: string[];
  affiliates: string[];
  counties: string[];
  deviceTypes: string[];
  lifecycleStatuses: string[];
}

export interface TimePreviewBoundsResponse {
  minDate: string;
  maxDate: string;
  defaultDate: string;
}

export interface KpiResponse {
  totalActiveDevices: number;
  highRiskDevices: number;
  pastEolDevices: number;
  estimatedRefreshCost: number;
  sitesWithHighRisk: number;
}

export interface HeatPoint {
  siteCode: string;
  lat: number;
  lon: number;
  riskScoreAvg: number;
  deviceCount: number;
  highRiskCount: number;
}

export interface MapFilterParams {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  affiliate?: string;
  deviceType?: string;
  state?: string;
}

export interface StateMapFeature {
  stateCode: string;
  stateFips: string;
  stateName: string;
  geometry: Polygon | MultiPolygon;
  riskScoreAvg: number | null;
  estimatedRefreshCost: number;
  deviceCount: number;
  highRiskCount: number;
}

export interface CountyMapFeature {
  stateCode: string;
  stateFips: string;
  countyFips: string;
  countyName: string;
  geometry: Polygon | MultiPolygon;
  riskScoreAvg: number | null;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

export interface CountySiteMarker {
  siteCode: string;
  siteName: string | null;
  lat: number;
  lon: number;
  riskScoreAvg: number;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

export interface CountySitesResponse {
  stateCode: string;
  countyFips: string;
  countyName: string;
  countyGeometry: Polygon | MultiPolygon;
  countyRiskScoreAvg: number | null;
  countyDeviceCount: number;
  countyHighRiskCount: number;
  countyEstimatedRefreshCost: number;
  sites: CountySiteMarker[];
}

export interface SiteSummaryResponse {
  stateCode: string;
  countyFips: string;
  countyName: string;
  siteCode: string;
  siteName: string | null;
  riskScoreAvg: number;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

export interface BreakdownRow {
  group: string;
  deviceCount: number;
  highRiskCount: number;
  pastEolCount: number;
  estimatedCost: number;
}

export interface RadiusGroup {
  groupId: string;
  radiusMi: number;
  siteCodes: string[];
  siteCount: number;
  deviceCount: number;
  highRiskCount: number;
  estimatedCost: number;
}

export interface RadiusGroupSiteSummary {
  siteCode: string;
  deviceCount: number;
  highRiskCount: number;
  estimatedCost: number;
  riskScoreAvg: number;
}

export interface ExceptionRecord {
  id: string;
  deviceId: string | null;
  deviceName: string;
  serialNumber: string | null;
  reason: string;
  projectTag: string | null;
  effectiveDate: string;
  expiresDate: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ApiListResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KeyCountDatum {
  key: string;
  count: number;
}

export interface BucketDatum {
  bucket: string;
  count: number;
}

export interface MonthlyDatum {
  month: string;
  count: number;
}

export interface CostDatum {
  label: string;
  cost: number;
}

export interface DeviceChartsResponse {
  summary: {
    totalDevices: number;
    highRiskDevices: number;
    estimatedRefreshCost: number;
  };
  riskBuckets: BucketDatum[];
  lifecycleStatuses: BucketDatum[];
  topDeviceTypes: KeyCountDatum[];
  sourceSystems: KeyCountDatum[];
  lifecycleBySupportCoverage: Array<{
    lifecycleStatus: string;
    supported: number;
    unsupported: number;
    unknown: number;
  }>;
  lifecycleBySecurityRisk: Array<{
    lifecycleStatus: string;
    high: number;
    medium: number;
    low: number;
  }>;
  costBySecurityRisk: CostDatum[];
}

export interface TopSiteChartDatum {
  siteCode: string;
  siteName: string | null;
  stateCode: string | null;
  county: string | null;
  riskScoreAvg: number;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

export interface SiteChartsResponse {
  summary: {
    totalSites: number;
    totalDevices: number;
    highRiskSites: number;
    estimatedRefreshCost: number;
  };
  riskBands: BucketDatum[];
  geographyCosts: CostDatum[];
  topSites: TopSiteChartDatum[];
}

export interface SiteDeviceChartsResponse {
  summary: {
    totalDevices: number;
    highRiskDevices: number;
    estimatedRefreshCost: number;
    avgRiskScore: number | null;
  };
  riskBuckets: BucketDatum[];
  lifecycleStatuses: BucketDatum[];
  deviceTypes: KeyCountDatum[];
}

export interface ExceptionChartsResponse {
  statusCounts: BucketDatum[];
  byProjectTag: KeyCountDatum[];
  monthlyEffective: MonthlyDatum[];
}

export interface SiteListItem {
  siteCode: string;
  siteName: string | null;
  stateCode: string | null;
  county: string | null;
  riskScoreAvg: number;
  deviceCount: number;
  highRiskCount: number;
  estimatedRefreshCost: number;
}

export type SourceSystem = "NA" | "PrimeAP" | "PrimeWLC" | "CatCtr";

export interface DeviceCandidate {
  sourceSystem: SourceSystem;
  deviceUnitKey: string;
  deviceName: string;
  deviceIp: string | null;
  modelRaw: string | null;
  modelNormalized: string | null;
  deviceTypeRaw: string | null;
  deviceTypeNormalized: string | null;
  statusRaw: string | null;
  isActive: boolean;
  stateCodeDerived: string | null;
  siteCodeDerived: string | null;
  controllerIp: string | null;
  controllerName: string | null;
  serialNumber: string | null;
  supportLevel: string | null;
  extra: Record<string, unknown>;
}

export interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  sourceSystem: SourceSystem;
  deviceType: string;
  deviceTypeRaw: string | null;
  model: string;
  siteCode: string | null;
  stateCode: string | null;
  affiliate: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  rawStatus: string | null;
  eosDate: string | null;
  eolDate: string | null;
  lifecycleStatus: "Past EoL" | "Past EoS" | "EoL <= 6mo" | "EoS <= 6mo" | "Supported";
  riskBucket: "Critical" | "High" | "Medium" | "Low";
  riskScore: number;
  materialCost: number | null;
  estimatedLaborCost: number | null;
  estimatedTotalCost: number | null;
  estimatedRefreshCost: number | null;
  supportLevel: string | null;
  supportCoverage: "Supported" | "Unsupported" | "Unknown";
  securityRisk: "High" | "Medium" | "Low";
  inScope: boolean | null;
  isDecomSite: boolean;
}
