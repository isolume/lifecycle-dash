export default function MethodologyPage() {
  const sourceInputs = [
    "Workbook supplied by Southern Company (tabs: SOLID, SOLID-Loc, NA, PrimeAP, PrimeWLC, CatCtr, Decom, ModelData, Pricing, Glossary).",
    "Organizational lifecycle fields (EoS/EoL), support status, location metadata, and cost fields from ModelData/Pricing.",
    "User-managed project exceptions entered in the dashboard (reason, effective/expiry dates, active flag).",
  ];

  const assumptions = [
    "Only active/reachable devices are eligible for analytics.",
    "NA Device Type is normalized to Switch, Router, or Voice Gateway.",
    "CatCtr/Prime are the source of truth for Access Points and Wireless Controllers; duplicate NA records are overridden.",
    "Hostname parsing assumption: first 2 characters map to state, next 3 map to site code when site metadata is missing.",
    "Planning-first defaults are ON in API/UI: out-of-scope OFF and decom OFF unless explicitly included.",
  ];

  const transformationRules = [
    "Normalize names/models/types to consistent casing and categories.",
    "Split comma-separated serial numbers into unit-level rows and create `device_id = device_name::serial` (`NO-SERIAL` fallback).",
    "Filter to active rows by source-specific rules (NA status, Prime uptime/reachability, CatCtr reachability).",
    "Join model metadata for lifecycle and in-scope fields; join site metadata for state/county/affiliate/lat/lon.",
    "Build PostGIS geography points (`geom`) for sites/devices with valid coordinates.",
    "Resolve costs using model value first, then component/labor and pricing-table fallback.",
  ];

  const riskFormula = [
    "Lifecycle score: Past EoL=70, Past EoS=55, EoL<=6mo=45, EoS<=6mo=35, Supported=10.",
    "Cost score: `min(material_cost, p95_material_cost) / p95_material_cost * 20`.",
    "Criticality score: WLC=10, Router=8, Switch=7, Voice Gateway=6, AP=5, Other=4.",
    "Final risk score: `round(lifecycle + cost + criticality)` bounded to 0-100.",
    "Risk buckets: Critical (80+), High (65-79), Medium (45-64), Low (0-44).",
  ];

  const exceptionHandling = [
    "Exceptions are linked by `device_id` (or legacy `device_name` when unambiguous).",
    "Active exception condition: `is_active = true`, `effective_date <= as_of_date`, and not expired.",
    "Ambiguous device names are rejected on create; users must provide `deviceId`.",
    "During full refresh ingest, exceptions are preserved via temporary table replay and remapped to current device identities.",
    "`includeExceptions` toggle controls whether excluded devices are reintroduced in analytics views.",
  ];

  const metrics = [
    "KPIs: total active devices, high-risk devices, past-EoL devices, estimated refresh cost, sites with high-risk devices.",
    "Map rollups: state/county/site average risk, high-risk counts, device counts, aggregated estimated refresh cost.",
    "Device analytics: lifecycle distribution, risk buckets, source-system mix, support/security correlations.",
    "Radius groups: grouped site count, grouped device count, grouped high-risk count, grouped estimated cost.",
    "Time preview: all metrics recomputed for selected `asOfDate` window, not only load date.",
  ];

  const riskCostReduction = [
    "Moves lifecycle work from reactive to forecast-based planning using dynamic as-of simulation.",
    "Prioritizes highest-risk and highest-cost pockets first to reduce outage/security exposure per dollar.",
    "Bundles nearby high-risk sites into radius groups to reduce truck rolls, project mobilization, and scheduling overhead.",
    "Integrates support/security overlays to avoid refreshing low-value assets while exposing unsupported risk concentrations.",
    "Exception controls prevent known out-of-scope devices from distorting project lists and budget forecasts.",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Technical Methodology and Data Pipeline</h1>
        <p className="mt-2 text-sm text-foreground/60">
          This page documents the implementation used to transform Southern Company network inventory inputs into lifecycle analytics and dashboard visualizations.
        </p>
      </div>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">End-to-End Load to Visualization Flow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-foreground/70">
          <li>Ingest structured workbook inputs from organizational systems into a PostGIS-backed warehouse.</li>
          <li>Normalize, filter, deduplicate, and enrich device records into unit-level rows (`devices` table).</li>
          <li>Persist exception rules and apply temporal filtering in SQL (`effective_devices` CTE).</li>
          <li>Serve aggregated metrics via API routes (`/api/dashboard/*`, `/api/devices`, `/api/exceptions`).</li>
          <li>Render outputs in the dashboard using React + Recharts (charts/KPIs) and React Leaflet (map layers).</li>
        </ol>
        <p className="mt-4 text-sm text-foreground/70">
          Visualization output is therefore a direct, filter-aware representation of organization-provided data with explicit transformation and business rules.
        </p>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Source Inputs (Organization Data)</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {sourceInputs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Assumptions Used</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Data Transformations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {transformationRules.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Lifecycle and Risk Logic</h2>
        <p className="mt-3 text-sm text-foreground/70">
          Lifecycle status is derived from EoS/EoL against a selected <code>asOfDate</code> and configurable month window (default 6). Persisted ingest values are
          recalculated at query time so timeline preview reflects future/past scenarios.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {riskFormula.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Lifecycle Grouping (Radius Clustering)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-foreground/70">
          <li>Filter devices to planning scope and risk threshold (default <code>riskMin=65</code>).</li>
          <li>Aggregate by site and compute a centroid from average lat/lon per site.</li>
          <li>Build inter-site edges using PostGIS <code>ST_DWithin</code> with user-selected radius (default 5 miles).</li>
          <li>Run Union-Find on site graph to produce connected components (transitive clusters).</li>
          <li>Summarize each group by high-risk count, device count, and total estimated cost for bundle planning.</li>
        </ol>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Exception Handling</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {exceptionHandling.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">Calculated Metrics</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {metrics.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6">
        <h2 className="text-xl font-semibold text-foreground">How This Reduces Risk and Cost</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-foreground/70">
          {riskCostReduction.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="border border-card-border bg-card-bg p-6 text-sm text-foreground/70">
        <h2 className="text-xl font-semibold text-foreground">Key Defaults and Notes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Ingest baseline reference date is fixed to 2026-02-28, while dashboard analytics recompute by selected Time Preview as-of date.</li>
          <li>Approaching lifecycle window default: 6 months.</li>
          <li>Radius grouping default: 5 miles.</li>
          <li>Risk threshold for high-risk views: score 65 and above.</li>
          <li>Security risk visualization is a lifecycle-derived proxy and not a CVE feed.</li>
        </ul>
      </section>
    </div>
  );
}
