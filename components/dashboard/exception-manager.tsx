"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ExceptionRecord } from "@/lib/types";
import { localIsoDate } from "@/lib/time/date";

interface ExceptionFormState {
  deviceId: string;
  deviceName: string;
  reason: string;
  projectTag: string;
  effectiveDate: string;
  expiresDate: string;
}

interface DeviceLookupResult {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
}

interface DeviceLookupResponse {
  data: DeviceLookupResult[];
}

interface DeviceSearchDropdownProps {
  className?: string;
  query: string;
  loading: boolean;
  results: DeviceLookupResult[];
  selectedDeviceId: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: DeviceLookupResult) => void;
}

function createEmptyForm(): ExceptionFormState {
  return {
    deviceId: "",
    deviceName: "",
    reason: "",
    projectTag: "",
    effectiveDate: localIsoDate(),
    expiresDate: "",
  };
}

function formatDeviceLabel(item: DeviceLookupResult): string {
  return `${item.deviceName} (${item.serialNumber ?? "NO-SERIAL"})`;
}

function DeviceSearchDropdown({
  className,
  query,
  loading,
  results,
  selectedDeviceId,
  onQueryChange,
  onSelect,
}: DeviceSearchDropdownProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const showDropdown = open && (!!query.trim() || loading || results.length > 0);
  const defaultActiveIndex = results.findIndex((item) => item.deviceId === selectedDeviceId);
  const resolvedActiveIndex = activeIndex >= 0 && activeIndex < results.length
    ? activeIndex
    : defaultActiveIndex >= 0
      ? defaultActiveIndex
      : results.length > 0
        ? 0
        : -1;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleMouseDown(event: MouseEvent): void {
      const root = containerRef.current;
      if (!root || root.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => {
        if (results.length === 0) return -1;
        return prev < results.length - 1 ? prev + 1 : 0;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => {
        if (results.length === 0) return -1;
        return prev > 0 ? prev - 1 : results.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && open && resolvedActiveIndex >= 0 && resolvedActiveIndex < results.length) {
      event.preventDefault();
      onSelect(results[resolvedActiveIndex]);
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        className="w-full"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search device name or serial"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto border border-card-border bg-card-bg shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
        >
          {!query.trim() ? (
            <p className="px-3 py-2 text-sm text-foreground/60">Search by device name or serial number.</p>
          ) : loading ? (
            <p className="px-3 py-2 text-sm text-foreground/60">Searching devices...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-foreground/60">No matching devices found.</p>
          ) : (
            <div>
              {results.map((item, index) => {
                const selected = item.deviceId === selectedDeviceId;
                const active = index === resolvedActiveIndex;
                return (
                  <button
                    key={item.deviceId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 border-b border-card-border px-3 py-2 text-left text-sm last:border-b-0 ${
                      active
                        ? "bg-accent-muted text-foreground"
                        : selected
                          ? "bg-surface-sunken text-foreground"
                          : "bg-card-bg text-foreground/85 hover:bg-surface-sunken"
                    }`}
                  >
                    <span className="font-medium">{item.deviceName}</span>
                    <span className="shrink-0 font-data text-xs text-foreground/60">{item.serialNumber ?? "NO-SERIAL"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ExceptionManager({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<ExceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ExceptionFormState>(createEmptyForm);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<DeviceLookupResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadExceptions(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exceptions", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load exceptions (${response.status})`);
      }

      const data = (await response.json()) as ExceptionRecord[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadExceptions();
  }, []);

  useEffect(() => {
    const query = lookupQuery.trim();
    if (!query) {
      setLookupResults([]);
      return;
    }

    let active = true;
    async function loadLookupResults(): Promise<void> {
      setLookupLoading(true);
      try {
        const params = new URLSearchParams({
          search: query,
          includeExceptions: "true",
          includeOutOfScope: "true",
          includeDecomSites: "true",
          page: "1",
          pageSize: "20",
        });
        const response = await fetch(`/api/devices?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Lookup failed (${response.status})`);
        }

        const payload = (await response.json()) as DeviceLookupResponse;
        if (!active) {
          return;
        }

        const uniqueResults = [...new Map(
          (payload.data ?? []).map((row) => [row.deviceId, row]),
        ).values()];
        setLookupResults(uniqueResults);
      } catch {
        if (active) {
          setLookupResults([]);
        }
      } finally {
        if (active) {
          setLookupLoading(false);
        }
      }
    }

    void loadLookupResults();
    return () => {
      active = false;
    };
  }, [lookupQuery]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [items]);

  function selectDevice(selected: DeviceLookupResult): void {
    setLookupQuery(formatDeviceLabel(selected));
    setForm((prev) => ({
      ...prev,
      deviceId: selected.deviceId,
      deviceName: selected.deviceName,
    }));
  }

  async function createException(): Promise<void> {
    if (!form.deviceId.trim() || !form.reason.trim()) {
      setError("Device selection and reason are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: form.deviceId.trim(),
          reason: form.reason.trim(),
          projectTag: form.projectTag.trim() || null,
          effectiveDate: form.effectiveDate || undefined,
          expiresDate: form.expiresDate || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : `Create failed (${response.status})`;
        throw new Error(message);
      }

      setForm(createEmptyForm());
      setLookupQuery("");
      setLookupResults([]);
      await loadExceptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item: ExceptionRecord): Promise<void> {
    setError(null);

    try {
      const response = await fetch(`/api/exceptions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !item.isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update failed (${response.status})`);
      }

      await loadExceptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  async function remove(item: ExceptionRecord): Promise<void> {
    setError(null);

    try {
      const response = await fetch(`/api/exceptions/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`);
      }

      await loadExceptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  return (
    <section className="border border-card-border bg-card-bg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Exception Manager</h3>
        <button
          type="button"
          onClick={() => void loadExceptions()}
          className="btn btn-secondary btn-sm"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <DeviceSearchDropdown
          className="md:col-span-2"
          query={lookupQuery}
          loading={lookupLoading}
          results={lookupResults}
          selectedDeviceId={form.deviceId}
          onQueryChange={(value) => {
            setLookupQuery(value);
            setForm((prev) => ({ ...prev, deviceId: "", deviceName: "" }));
          }}
          onSelect={selectDevice}
        />
        <input
          value={form.reason}
          onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
          placeholder="Reason"
        />
        <input
          value={form.projectTag}
          onChange={(event) => setForm((prev) => ({ ...prev, projectTag: event.target.value }))}
          placeholder="Project tag"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={form.effectiveDate}
            onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
            type="date"
          />
          <input
            value={form.expiresDate}
            onChange={(event) => setForm((prev) => ({ ...prev, expiresDate: event.target.value }))}
            type="date"
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-foreground/50">
        {form.deviceId ? `Selected device unit: ${form.deviceId}` : "Select a specific device unit before saving."}
      </div>

      <div className="mt-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void createException()}
          className="btn btn-primary"
        >
          {submitting ? "Saving..." : "Add Exception"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial</th>
              <th>Reason</th>
              <th>Tag</th>
              <th>Status</th>
              {!compact ? <th>Dates</th> : null}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={compact ? 6 : 7}>
                  <div className="space-y-2 py-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="skeleton h-8 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : sortedItems.length === 0 ? (
              <tr>
                <td className="text-foreground/50" colSpan={compact ? 6 : 7}>
                  No exception records yet.
                </td>
              </tr>
            ) : (
              sortedItems.slice(0, compact ? 8 : sortedItems.length).map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="font-semibold text-foreground">{item.deviceName}</td>
                  <td className="font-data text-foreground/80">{item.serialNumber ?? "NO-SERIAL"}</td>
                  <td className="text-foreground/80">{item.reason}</td>
                  <td className="text-foreground/80">{item.projectTag || "-"}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.isActive ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {!compact ? (
                    <td className="font-data text-foreground/70">
                      {item.effectiveDate}
                      {item.expiresDate ? ` -> ${item.expiresDate}` : " -> Open"}
                    </td>
                  ) : null}
                  <td className="space-x-2">
                    <button
                      type="button"
                      onClick={() => void toggleActive(item)}
                      className="btn btn-secondary btn-sm"
                    >
                      {item.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="btn btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
