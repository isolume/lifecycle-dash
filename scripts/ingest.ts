import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PoolClient } from "pg";
import { getPool } from "../lib/db";
import { RADIUS_MILES_DEFAULT, REFERENCE_DATE, REQUIRED_SHEETS, SOURCE_PRIORITY, WINDOW_MONTHS_DEFAULT } from "../lib/constants";
import {
  buildDeviceId,
  calculateCostP95,
  classifyLifecycleStatus,
  computeRiskScore,
  deriveSecurityRisk,
  deriveSupportCoverage,
  deriveStateAndSiteCode,
  getRiskBucket,
  normalizeCatCtrFamily,
  normalizeDeviceName,
  normalizeModel,
  normalizeNaDeviceType,
  splitSerialNumbers,
} from "../lib/etl/transform";
import { chunk, excelSerialToIsoDate, parseBooleanYN, toNullableNumber, toNullableString } from "../lib/sql";
import { DeviceCandidate, DeviceRecord, SourceSystem } from "../lib/types";

interface CliArgs {
  filePath: string;
}

interface SiteRow {
  siteCode: string;
  siteName: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ownerAffiliate: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  isDecom: boolean;
}

interface ModelRow {
  model: string;
  modelParent: string | null;
  eosDate: string | null;
  eolDate: string | null;
  category: string | null;
  referenceUrl: string | null;
  inScope: boolean | null;
  replacementModel: string | null;
  dnaRequired: boolean | null;
  dnaPartNumber: string | null;
  stagingRequired: boolean | null;
  deHours: number | null;
  seHours: number | null;
  fotHours: number | null;
  pmHours: number | null;
  deCost: number | null;
  seCost: number | null;
  fotCost: number | null;
  laborCost: number | null;
  deviceCost: number | null;
  dnaCost: number | null;
  stagingCost: number | null;
  taxOh: number | null;
  materialCost: number | null;
}

interface PricingRow {
  parentProduct: string | null;
  product: string | null;
  description: string | null;
  pricing: number | null;
  isDevice: boolean | null;
  notes: string | null;
  laborDe: number | null;
  laborSe: number | null;
  laborFo: number | null;
}

type AnyRow = Record<string, unknown>;

const DESIGN_ENGINEER_HOURLY_RATE = 130;
const SUPPORT_ENGINEER_HOURLY_RATE = 130;
const FIELD_OPERATIONS_HOURLY_RATE = 125;

function parseArgs(argv: string[]): CliArgs {
  const fileFlagIndex = argv.findIndex((arg) => arg === "--file");
  const filePath = fileFlagIndex >= 0 ? argv[fileFlagIndex + 1] : process.env.UA_DATA_FILE;

  if (!filePath) {
    throw new Error('Missing data file. Run: npm run ingest -- --file "/absolute/path/to/UAInnovateDataset-SoCo.xlsx"');
  }

  return { filePath };
}

function ensureWorkbook(filePath: string): XLSX.WorkBook {
  const absolutePath = path.resolve(filePath);
  readFileSync(absolutePath);
  const workbook = XLSX.readFile(absolutePath, { raw: true, cellDates: false, dense: false });

  const sheetSet = new Set(workbook.SheetNames);
  for (const sheet of REQUIRED_SHEETS) {
    if (!sheetSet.has(sheet)) {
      throw new Error(`Workbook is missing required sheet: ${sheet}`);
    }
  }

  return workbook;
}

function getSheetRows(workbook: XLSX.WorkBook, sheetName: string): AnyRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<AnyRow>(sheet, { defval: "", raw: true });
}

function getString(row: AnyRow, key: string): string | null {
  return toNullableString(row[key]);
}

function parseDateLike(value: unknown): string | null {
  const excelDate = excelSerialToIsoDate(value);
  if (excelDate) {
    return excelDate;
  }

  const str = toNullableString(value);
  if (!str) {
    return null;
  }

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function buildSites(solidRows: AnyRow[], solidLocRows: AnyRow[], decomRows: AnyRow[]): SiteRow[] {
  const bySite = new Map<string, SiteRow>();

  for (const row of solidRows) {
    const siteCode = getString(row, "Site Code");
    if (!siteCode) {
      continue;
    }

    const key = siteCode.toUpperCase();
    bySite.set(key, {
      siteCode: key,
      siteName: getString(row, "Site Name"),
      streetAddress1: getString(row, "Street Address 1"),
      streetAddress2: getString(row, "Street Address 2"),
      city: getString(row, "City"),
      state: getString(row, "State"),
      zip: getString(row, "Zip"),
      ownerAffiliate: null,
      county: null,
      lat: null,
      lon: null,
      isDecom: false,
    });
  }

  for (const row of solidLocRows) {
    const siteCode = getString(row, "Site Code");
    if (!siteCode) {
      continue;
    }

    const key = siteCode.toUpperCase();
    const existing = bySite.get(key);
    const lat = toNullableNumber(row.Latitude);
    const lon = toNullableNumber(row.Longitude);

    const merged: SiteRow = {
      siteCode: key,
      siteName: getString(row, "Site Name") ?? existing?.siteName ?? null,
      streetAddress1: existing?.streetAddress1 ?? null,
      streetAddress2: existing?.streetAddress2 ?? null,
      city: existing?.city ?? null,
      state: existing?.state ?? null,
      zip: existing?.zip ?? null,
      ownerAffiliate: getString(row, "Owner") ?? existing?.ownerAffiliate ?? null,
      county: getString(row, "PhysicalAddressCounty") ?? existing?.county ?? null,
      lat: lat ?? existing?.lat ?? null,
      lon: lon ?? existing?.lon ?? null,
      isDecom: existing?.isDecom ?? false,
    };

    bySite.set(key, merged);
  }

  const decomSites = new Set(
    decomRows
      .filter((row) => (getString(row, "Decom") ?? "").toLowerCase() === "yes")
      .map((row) => (getString(row, "Site Cd") ?? "").toUpperCase())
      .filter(Boolean),
  );

  for (const siteCode of decomSites) {
    const existing = bySite.get(siteCode);
    if (existing) {
      existing.isDecom = true;
      bySite.set(siteCode, existing);
    }
  }

  return [...bySite.values()];
}

function buildModels(modelRows: AnyRow[]): ModelRow[] {
  const models: ModelRow[] = [];

  for (const row of modelRows) {
    const model = getString(row, "Model")?.toUpperCase();
    if (!model) {
      continue;
    }

    models.push({
      model,
      modelParent: getString(row, "Model Parent"),
      eosDate: parseDateLike(row.EoS),
      eolDate: parseDateLike(row.EoL),
      category: getString(row, "Category"),
      referenceUrl: getString(row, "URL"),
      inScope: parseBooleanYN(row["In Scope?"] === "Yes" ? "Y" : row["In Scope?"]),
      replacementModel: getString(row, "Repl Device"),
      dnaRequired: parseBooleanYN(row["DNA (Y/N)"]),
      dnaPartNumber: getString(row, "DNA Part Number"),
      stagingRequired: parseBooleanYN(row["Stg / Config (Y/N)"]),
      deHours: toNullableNumber(row["DE Hrs"]),
      seHours: toNullableNumber(row["SE Hrs"]),
      fotHours: toNullableNumber(row["FOT Hrs"]),
      pmHours: toNullableNumber(row["PM Hrs"]),
      deCost: toNullableNumber(row["DE Cost"]),
      seCost: toNullableNumber(row["SE Cost"]),
      fotCost: toNullableNumber(row["FOT Cost"]),
      laborCost: toNullableNumber(row["Labor Cost"]),
      deviceCost: toNullableNumber(row["Device Cost"]),
      dnaCost: toNullableNumber(row["DNA Cost"]),
      stagingCost: toNullableNumber(row["Staging Cost"]),
      taxOh: toNullableNumber(row["Tax&OH"]),
      materialCost: toNullableNumber(row["Material Cost"]),
    });
  }

  return models;
}

function buildPricing(pricingRows: AnyRow[]): PricingRow[] {
  return pricingRows.map((row) => ({
    parentProduct: getString(row, "Parent Product"),
    product: getString(row, "Product"),
    description: getString(row, "Description"),
    pricing: toNullableNumber(row.Pricing),
    isDevice: parseBooleanYN(row["Device?"]),
    notes: getString(row, "Notes"),
    laborDe: toNullableNumber(row["Labor-DE"]),
    laborSe: toNullableNumber(row["Labor-SE"]),
    laborFo: toNullableNumber(row["Labor-FO"]),
  }));
}

function normalizeProductKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function buildPricingCostLookups(pricingRows: PricingRow[]): {
  materialByProduct: Map<string, number>;
  laborByProduct: Map<string, number>;
} {
  const materialByProduct = new Map<string, number>();
  const laborByProduct = new Map<string, number>();

  for (const row of pricingRows) {
    const keys = [normalizeProductKey(row.parentProduct), normalizeProductKey(row.product)].filter((key): key is string => Boolean(key));

    const laborCost = (
      (row.laborDe ?? 0) * DESIGN_ENGINEER_HOURLY_RATE
      + (row.laborSe ?? 0) * SUPPORT_ENGINEER_HOURLY_RATE
      + (row.laborFo ?? 0) * FIELD_OPERATIONS_HOURLY_RATE
    );

    for (const key of keys) {
      if (row.isDevice && typeof row.pricing === "number" && Number.isFinite(row.pricing)) {
        const previous = materialByProduct.get(key) ?? 0;
        materialByProduct.set(key, Math.max(previous, row.pricing));
      }

      if (laborCost > 0) {
        const previous = laborByProduct.get(key) ?? 0;
        laborByProduct.set(key, Math.max(previous, laborCost));
      }
    }
  }

  return { materialByProduct, laborByProduct };
}

function resolveLaborCost(model: ModelRow | undefined, pricingLaborByProduct: Map<string, number>): number | null {
  if (!model) {
    return null;
  }

  const modelLabor = model.laborCost;
  if (typeof modelLabor === "number" && Number.isFinite(modelLabor)) {
    return modelLabor;
  }

  const componentLabor = [model.deCost, model.seCost, model.fotCost]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
  if (componentLabor > 0) {
    return componentLabor;
  }

  const modelKey = normalizeProductKey(model.model);
  const parentKey = normalizeProductKey(model.modelParent);
  const fallback = (modelKey ? pricingLaborByProduct.get(modelKey) : undefined)
    ?? (parentKey ? pricingLaborByProduct.get(parentKey) : undefined);

  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return null;
}

function resolveMaterialCost(model: ModelRow | undefined, pricingMaterialByProduct: Map<string, number>): number | null {
  if (!model) {
    return null;
  }

  if (typeof model.materialCost === "number" && Number.isFinite(model.materialCost)) {
    return model.materialCost;
  }

  const modelKey = normalizeProductKey(model.model);
  const parentKey = normalizeProductKey(model.modelParent);
  const fallback = (modelKey ? pricingMaterialByProduct.get(modelKey) : undefined)
    ?? (parentKey ? pricingMaterialByProduct.get(parentKey) : undefined);

  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return null;
}

function toCandidateBase(
  sourceSystem: SourceSystem,
  deviceName: string,
  serialNumber: string | null,
): Pick<DeviceCandidate, "sourceSystem" | "deviceName" | "stateCodeDerived" | "siteCodeDerived" | "serialNumber" | "deviceUnitKey"> {
  const derived = deriveStateAndSiteCode(deviceName);

  return {
    sourceSystem,
    deviceName,
    serialNumber,
    deviceUnitKey: buildDeviceId(deviceName, serialNumber),
    stateCodeDerived: derived.stateCode,
    siteCodeDerived: derived.siteCode,
  };
}

function buildCandidates(rowsBySheet: {
  naRows: AnyRow[];
  primeApRows: AnyRow[];
  primeWlcRows: AnyRow[];
  catCtrRows: AnyRow[];
}): {
  candidates: DeviceCandidate[];
  stats: Record<string, number>;
} {
  const stats: Record<string, number> = {
    naTotal: 0,
    naActive: 0,
    primeApTotal: 0,
    primeApActive: 0,
    primeWlcTotal: 0,
    primeWlcActive: 0,
    catCtrTotal: 0,
    catCtrActive: 0,
  };

  const candidates: DeviceCandidate[] = [];

  for (const row of rowsBySheet.naRows) {
    stats.naTotal += 1;
    const deviceName = normalizeDeviceName(getString(row, "Host Name"));
    if (!deviceName) {
      continue;
    }

    const statusRaw = getString(row, "Device Status");
    const isActive = statusRaw?.toLowerCase() === "active";
    if (!isActive) {
      continue;
    }

    stats.naActive += 1;
    const typeRaw = getString(row, "Device Type");

    for (const serialNumber of splitSerialNumbers(getString(row, "Serial Number"))) {
      candidates.push({
        ...toCandidateBase("NA", deviceName, serialNumber),
        deviceIp: getString(row, "Device IP"),
        modelRaw: getString(row, "Device Model"),
        modelNormalized: normalizeModel("NA", getString(row, "Device Model")),
        deviceTypeRaw: typeRaw,
        deviceTypeNormalized: normalizeNaDeviceType(typeRaw),
        statusRaw,
        isActive,
        controllerIp: null,
        controllerName: null,
        supportLevel: null,
        extra: {
          vendor: getString(row, "Device Vendor"),
          softwareVersion: getString(row, "Software Version"),
        },
      });
    }
  }

  for (const row of rowsBySheet.primeApRows) {
    stats.primeApTotal += 1;
    const deviceName = normalizeDeviceName(getString(row, "name"));
    if (!deviceName) {
      continue;
    }

    const upTime = toNullableNumber(row.upTime);
    const isActive = (upTime ?? 0) > 0;
    if (!isActive) {
      continue;
    }

    stats.primeApActive += 1;

    for (const serialNumber of splitSerialNumbers(getString(row, "serialNumber"))) {
      candidates.push({
        ...toCandidateBase("PrimeAP", deviceName, serialNumber),
        deviceIp: getString(row, "ipAddress"),
        modelRaw: getString(row, "model"),
        modelNormalized: normalizeModel("PrimeAP", getString(row, "model")),
        deviceTypeRaw: "Access Point",
        deviceTypeNormalized: "Access Point",
        statusRaw: getString(row, "status"),
        isActive,
        controllerIp: getString(row, "controllerIpAddress"),
        controllerName: getString(row, "controllerName"),
        supportLevel: null,
        extra: {
          clientCount: toNullableNumber(row.clientCount),
        },
      });
    }
  }

  for (const row of rowsBySheet.primeWlcRows) {
    stats.primeWlcTotal += 1;
    const deviceName = normalizeDeviceName(getString(row, "deviceName"));
    if (!deviceName) {
      continue;
    }

    const reachability = getString(row, "reachability");
    const isActive = reachability?.toUpperCase() === "REACHABLE";
    if (!isActive) {
      continue;
    }

    stats.primeWlcActive += 1;

    for (const serialNumber of splitSerialNumbers(getString(row, "manufacturer_part_serialNumber"))) {
      candidates.push({
        ...toCandidateBase("PrimeWLC", deviceName, serialNumber),
        deviceIp: getString(row, "ipAddress"),
        modelRaw: getString(row, "manufacturer_part_partNumber"),
        modelNormalized: normalizeModel("PrimeWLC", getString(row, "manufacturer_part_partNumber")),
        deviceTypeRaw: "Wireless Controller",
        deviceTypeNormalized: "Wireless Controller",
        statusRaw: reachability,
        isActive,
        controllerIp: null,
        controllerName: null,
        supportLevel: null,
        extra: {
          managementStatus: getString(row, "managementStatus"),
        },
      });
    }
  }

  for (const row of rowsBySheet.catCtrRows) {
    stats.catCtrTotal += 1;
    const deviceName = normalizeDeviceName(getString(row, "hostname"));
    if (!deviceName) {
      continue;
    }

    const reachability = getString(row, "reachabilityStatus");
    const isActive = ["reachable", "ping reachable"].includes((reachability ?? "").toLowerCase());
    if (!isActive) {
      continue;
    }

    stats.catCtrActive += 1;

    const family = getString(row, "family");
    const supportLevel = getString(row, "deviceSupportLevel");

    for (const serialNumber of splitSerialNumbers(getString(row, "serialNumber"))) {
      candidates.push({
        ...toCandidateBase("CatCtr", deviceName, serialNumber),
        deviceIp: getString(row, "dnsResolvedManagementAddress"),
        modelRaw: getString(row, "platformId"),
        modelNormalized: normalizeModel("CatCtr", getString(row, "platformId")),
        deviceTypeRaw: family,
        deviceTypeNormalized: normalizeCatCtrFamily(family),
        statusRaw: reachability,
        isActive,
        controllerIp: getString(row, "associatedWlcIp"),
        controllerName: null,
        supportLevel,
        extra: {
          role: getString(row, "role"),
        },
      });
    }
  }

  return { candidates, stats };
}

function dedupeCandidates(candidates: DeviceCandidate[]): {
  finalCandidates: DeviceCandidate[];
  stats: Record<string, number>;
} {
  const stats: Record<string, number> = {
    droppedNaType: 0,
    droppedApPrefix: 0,
    droppedMissingModel: 0,
    droppedByOverride: 0,
  };

  const apwlcByUnit = new Map<string, DeviceCandidate>();

  for (const candidate of candidates) {
    const normalizedType = candidate.deviceTypeNormalized;
    if (!["Access Point", "Wireless Controller"].includes(normalizedType ?? "")) {
      continue;
    }

    if (normalizedType === "Access Point" && candidate.deviceName.startsWith("AP")) {
      stats.droppedApPrefix += 1;
      continue;
    }

    const existing = apwlcByUnit.get(candidate.deviceUnitKey);
    if (!existing) {
      apwlcByUnit.set(candidate.deviceUnitKey, candidate);
      continue;
    }

    if (SOURCE_PRIORITY[candidate.sourceSystem] > SOURCE_PRIORITY[existing.sourceSystem]) {
      apwlcByUnit.set(candidate.deviceUnitKey, candidate);
    }
  }

  const finalByUnit = new Map<string, DeviceCandidate>();

  for (const candidate of candidates) {
    if (candidate.sourceSystem !== "NA") {
      continue;
    }

    if (!candidate.deviceTypeNormalized || !["Switch", "Router", "Voice Gateway"].includes(candidate.deviceTypeNormalized)) {
      stats.droppedNaType += 1;
      continue;
    }

    if (apwlcByUnit.has(candidate.deviceUnitKey)) {
      stats.droppedByOverride += 1;
      continue;
    }

    if (!candidate.modelNormalized) {
      stats.droppedMissingModel += 1;
      continue;
    }

    const existing = finalByUnit.get(candidate.deviceUnitKey);
    if (!existing || SOURCE_PRIORITY[candidate.sourceSystem] >= SOURCE_PRIORITY[existing.sourceSystem]) {
      finalByUnit.set(candidate.deviceUnitKey, candidate);
    }
  }

  for (const candidate of apwlcByUnit.values()) {
    if (!candidate.modelNormalized) {
      stats.droppedMissingModel += 1;
      continue;
    }

    const existing = finalByUnit.get(candidate.deviceUnitKey);
    if (!existing || SOURCE_PRIORITY[candidate.sourceSystem] >= SOURCE_PRIORITY[existing.sourceSystem]) {
      finalByUnit.set(candidate.deviceUnitKey, candidate);
    }
  }

  return {
    finalCandidates: [...finalByUnit.values()],
    stats,
  };
}

function enrichDeviceRecords(
  candidates: DeviceCandidate[],
  sites: SiteRow[],
  models: ModelRow[],
  pricingRows: PricingRow[],
): DeviceRecord[] {
  const siteByCode = new Map(sites.map((site) => [site.siteCode, site]));
  const modelByModel = new Map(models.map((model) => [model.model, model]));
  const { materialByProduct, laborByProduct } = buildPricingCostLookups(pricingRows);

  const baseRecords: Array<Omit<DeviceRecord, "riskScore" | "riskBucket">> = [];

  for (const candidate of candidates) {
    const modelCode = candidate.modelNormalized;
    if (!modelCode) {
      continue;
    }

    const site = candidate.siteCodeDerived ? siteByCode.get(candidate.siteCodeDerived) : undefined;
    const model = modelByModel.get(modelCode);

    const stateCode = site?.state?.toUpperCase() ?? candidate.stateCodeDerived;
    const siteCode = site?.siteCode ?? null;

    const lifecycleStatus = classifyLifecycleStatus(model?.eosDate ?? null, model?.eolDate ?? null, REFERENCE_DATE, WINDOW_MONTHS_DEFAULT);
    const materialCost = resolveMaterialCost(model, materialByProduct);
    const estimatedLaborCost = resolveLaborCost(model, laborByProduct);
    const estimatedTotalCost = materialCost === null && estimatedLaborCost === null
      ? null
      : (materialCost ?? 0) + (estimatedLaborCost ?? 0);
    const supportCoverage = deriveSupportCoverage(candidate.sourceSystem, candidate.supportLevel);
    const securityRisk = deriveSecurityRisk(lifecycleStatus);

    baseRecords.push({
      deviceId: buildDeviceId(candidate.deviceName, candidate.serialNumber),
      deviceName: candidate.deviceName,
      serialNumber: candidate.serialNumber,
      sourceSystem: candidate.sourceSystem,
      deviceType: candidate.deviceTypeNormalized ?? "Other",
      deviceTypeRaw: candidate.deviceTypeRaw,
      model: modelCode,
      siteCode: siteCode ?? null,
      stateCode,
      affiliate: site?.ownerAffiliate ?? null,
      county: site?.county ?? null,
      lat: site?.lat ?? null,
      lon: site?.lon ?? null,
      rawStatus: candidate.statusRaw,
      eosDate: model?.eosDate ?? null,
      eolDate: model?.eolDate ?? null,
      lifecycleStatus,
      materialCost,
      estimatedLaborCost,
      estimatedTotalCost,
      estimatedRefreshCost: estimatedTotalCost,
      supportLevel: candidate.supportLevel,
      supportCoverage,
      securityRisk,
      inScope: model?.inScope ?? null,
      isDecomSite: site?.isDecom ?? false,
    });
  }

  const materialCosts = baseRecords
    .map((record) => record.materialCost)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const p95 = calculateCostP95(materialCosts);

  return baseRecords.map((record) => {
    const riskScore = computeRiskScore(record.lifecycleStatus, record.deviceType, record.materialCost, p95);

    return {
      ...record,
      riskScore,
      riskBucket: getRiskBucket(riskScore),
    };
  });
}

async function insertChunked(
  client: PoolClient,
  tableName: string,
  columns: string[],
  rows: Array<Array<string | number | boolean | null | object>>,
  chunkSize = 500,
): Promise<void> {
  if (!rows.length) {
    return;
  }

  for (const rowsChunk of chunk(rows, chunkSize)) {
    const values: Array<string | number | boolean | null | object> = [];
    const rowPlaceholders: string[] = [];

    for (const row of rowsChunk) {
      const placeholders: string[] = [];
      for (const value of row) {
        values.push(value);
        placeholders.push(`$${values.length}`);
      }
      rowPlaceholders.push(`(${placeholders.join(", ")})`);
    }

    const query = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
    await client.query(query, values);
  }
}

async function run(): Promise<void> {
  const { filePath } = parseArgs(process.argv.slice(2));
  const workbook = ensureWorkbook(filePath);

  const solidRows = getSheetRows(workbook, "SOLID");
  const solidLocRows = getSheetRows(workbook, "SOLID-Loc");
  const naRows = getSheetRows(workbook, "NA");
  const primeApRows = getSheetRows(workbook, "PrimeAP");
  const primeWlcRows = getSheetRows(workbook, "PrimeWLC");
  const catCtrRows = getSheetRows(workbook, "CatCtr");
  const decomRows = getSheetRows(workbook, "Decom");
  const modelRows = getSheetRows(workbook, "ModelData");
  const pricingRows = getSheetRows(workbook, "Pricing");

  const sites = buildSites(solidRows, solidLocRows, decomRows);
  const models = buildModels(modelRows);
  const pricing = buildPricing(pricingRows);
  const { candidates, stats: sourceStats } = buildCandidates({ naRows, primeApRows, primeWlcRows, catCtrRows });
  const { finalCandidates, stats: dedupeStats } = dedupeCandidates(candidates);
  const devices = enrichDeviceRecords(finalCandidates, sites, models, pricing);

  const pool = getPool();
  const runInsert = await pool.query<{ id: number }>(
    `INSERT INTO ingest_runs (source_file, status) VALUES ($1, 'running') RETURNING id`,
    [path.resolve(filePath)],
  );
  const runId = runInsert.rows[0]?.id;

  if (!runId) {
    throw new Error("Unable to create ingest run record.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE TEMP TABLE tmp_exceptions AS SELECT * FROM device_exceptions`);

    await client.query(`
      TRUNCATE TABLE
        device_exceptions,
        device_candidates,
        devices,
        sites,
        models,
        pricing
      RESTART IDENTITY
    `);

    await insertChunked(
      client,
      "sites",
      [
        "site_code",
        "site_name",
        "street_address_1",
        "street_address_2",
        "city",
        "state",
        "zip",
        "owner_affiliate",
        "county",
        "lat",
        "lon",
        "is_decom",
      ],
      sites.map((site) => [
        site.siteCode,
        site.siteName,
        site.streetAddress1,
        site.streetAddress2,
        site.city,
        site.state,
        site.zip,
        site.ownerAffiliate,
        site.county,
        site.lat,
        site.lon,
        site.isDecom,
      ]),
    );

    await client.query(`
      UPDATE sites
      SET geom = CASE
        WHEN lat IS NOT NULL AND lon IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
        ELSE NULL
      END
    `);

    await insertChunked(
      client,
      "models",
      [
        "model",
        "model_parent",
        "eos_date",
        "eol_date",
        "category",
        "reference_url",
        "in_scope",
        "replacement_model",
        "dna_required",
        "dna_part_number",
        "staging_required",
        "de_hours",
        "se_hours",
        "fot_hours",
        "pm_hours",
        "de_cost",
        "se_cost",
        "fot_cost",
        "labor_cost",
        "device_cost",
        "dna_cost",
        "staging_cost",
        "tax_oh",
        "material_cost",
      ],
      models.map((model) => [
        model.model,
        model.modelParent,
        model.eosDate,
        model.eolDate,
        model.category,
        model.referenceUrl,
        model.inScope,
        model.replacementModel,
        model.dnaRequired,
        model.dnaPartNumber,
        model.stagingRequired,
        model.deHours,
        model.seHours,
        model.fotHours,
        model.pmHours,
        model.deCost,
        model.seCost,
        model.fotCost,
        model.laborCost,
        model.deviceCost,
        model.dnaCost,
        model.stagingCost,
        model.taxOh,
        model.materialCost,
      ]),
    );

    await insertChunked(
      client,
      "pricing",
      ["parent_product", "product", "description", "pricing", "is_device", "notes", "labor_de", "labor_se", "labor_fo"],
      pricing.map((item) => [
        item.parentProduct,
        item.product,
        item.description,
        item.pricing,
        item.isDevice,
        item.notes,
        item.laborDe,
        item.laborSe,
        item.laborFo,
      ]),
    );

    await insertChunked(
      client,
      "device_candidates",
      [
        "ingest_run_id",
        "source_system",
        "device_unit_key",
        "device_name",
        "device_ip",
        "model_raw",
        "model_normalized",
        "device_type_raw",
        "device_type_normalized",
        "status_raw",
        "is_active",
        "state_code_derived",
        "site_code_derived",
        "controller_ip",
        "controller_name",
        "serial_number",
        "extra",
      ],
      candidates.map((candidate) => [
        runId,
        candidate.sourceSystem,
        candidate.deviceUnitKey,
        candidate.deviceName,
        candidate.deviceIp,
        candidate.modelRaw,
        candidate.modelNormalized,
        candidate.deviceTypeRaw,
        candidate.deviceTypeNormalized,
        candidate.statusRaw,
        candidate.isActive,
        candidate.stateCodeDerived,
        candidate.siteCodeDerived,
        candidate.controllerIp,
        candidate.controllerName,
        candidate.serialNumber,
        JSON.stringify({
          ...(candidate.extra ?? {}),
          supportLevel: candidate.supportLevel,
        }),
      ]),
    );

    await insertChunked(
      client,
      "devices",
      [
        "device_id",
        "device_name",
        "serial_number",
        "ingest_run_id",
        "source_system",
        "device_type",
        "device_type_raw",
        "model",
        "site_code",
        "state_code",
        "affiliate",
        "county",
        "lat",
        "lon",
        "raw_status",
        "eos_date",
        "eol_date",
        "lifecycle_status",
        "risk_bucket",
        "risk_score",
        "material_cost",
        "estimated_labor_cost",
        "estimated_total_cost",
        "estimated_refresh_cost",
        "support_level",
        "support_coverage",
        "security_risk",
        "in_scope",
        "is_decom_site",
      ],
      devices.map((device) => [
        device.deviceId,
        device.deviceName,
        device.serialNumber,
        runId,
        device.sourceSystem,
        device.deviceType,
        device.deviceTypeRaw,
        device.model,
        device.siteCode,
        device.stateCode,
        device.affiliate,
        device.county,
        device.lat,
        device.lon,
        device.rawStatus,
        device.eosDate,
        device.eolDate,
        device.lifecycleStatus,
        device.riskBucket,
        device.riskScore,
        device.materialCost,
        device.estimatedLaborCost,
        device.estimatedTotalCost,
        device.estimatedRefreshCost,
        device.supportLevel,
        device.supportCoverage,
        device.securityRisk,
        device.inScope,
        device.isDecomSite,
      ]),
    );

    await client.query(`
      UPDATE devices
      SET geom = CASE
        WHEN lat IS NOT NULL AND lon IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
        ELSE NULL
      END
    `);

    await client.query(`
      WITH unique_devices AS (
        SELECT device_name, MIN(device_id) AS device_id
        FROM devices
        GROUP BY device_name
        HAVING COUNT(*) = 1
      )
      INSERT INTO device_exceptions (id, device_id, device_name, reason, project_tag, effective_date, expires_date, is_active, created_at, updated_at)
      SELECT
        t.id,
        COALESCE(d.device_id, u.device_id) AS device_id,
        COALESCE(d.device_name, t.device_name) AS device_name,
        t.reason,
        t.project_tag,
        t.effective_date,
        t.expires_date,
        t.is_active,
        t.created_at,
        t.updated_at
      FROM tmp_exceptions t
      LEFT JOIN devices d
        ON t.device_id IS NOT NULL
       AND d.device_id = t.device_id
      LEFT JOIN unique_devices u
        ON t.device_id IS NULL
       AND t.device_name = u.device_name
      WHERE COALESCE(d.device_id, u.device_id) IS NOT NULL
      ON CONFLICT (id) DO NOTHING
    `);

    await client.query("COMMIT");

    const stats = {
      input: {
        solidRows: solidRows.length,
        solidLocRows: solidLocRows.length,
        naRows: naRows.length,
        primeApRows: primeApRows.length,
        primeWlcRows: primeWlcRows.length,
        catCtrRows: catCtrRows.length,
        modelRows: modelRows.length,
        pricingRows: pricingRows.length,
      },
      sourceStats,
      dedupeStats,
      output: {
        sites: sites.length,
        models: models.length,
        pricing: pricing.length,
        candidates: candidates.length,
        devices: devices.length,
      },
      defaults: {
        referenceDate: REFERENCE_DATE.toISOString().slice(0, 10),
        windowMonths: WINDOW_MONTHS_DEFAULT,
        radiusMilesDefault: RADIUS_MILES_DEFAULT,
      },
    };

    await pool.query(
      `UPDATE ingest_runs SET status = 'success', stats = $2::jsonb, finished_at = NOW() WHERE id = $1`,
      [runId, JSON.stringify(stats)],
    );

    console.log(`Ingest complete. runId=${runId} devices=${devices.length}`);
  } catch (error) {
    await client.query("ROLLBACK");

    await pool.query(
      `UPDATE ingest_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
      [runId, error instanceof Error ? error.message : "Unknown ingest error"],
    );

    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Ingest failed:", error);
  process.exit(1);
});
