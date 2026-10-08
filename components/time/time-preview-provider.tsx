"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { KpiResponse, TimePreviewBoundsResponse } from "@/lib/types";
import { clampIsoDate, normalizeToMonthStart } from "@/lib/time/query";
import { localIsoDate } from "@/lib/time/date";

const STORAGE_KEY = "dashboard.asOfDate";

export interface TimePreviewScope {
  includeExceptions: boolean;
  includeOutOfScope?: boolean;
  includeDecomSites?: boolean;
  state?: string;
  affiliate?: string;
  county?: string;
  deviceType?: string;
  siteCode?: string;
  siteCodes?: string[];
}

interface TimePreviewContextValue {
  asOfDate?: string;
  bounds: TimePreviewBoundsResponse | null;
  loadingBounds: boolean;
  setAsOfDate: (date: string) => void;
  resetAsOfDate: () => void;
  scope: TimePreviewScope;
  setScope: (scope: TimePreviewScope) => void;
  latestKpis: KpiResponse | null;
  kpisLoading: boolean;
}

const TimePreviewContext = createContext<TimePreviewContextValue | null>(null);

function todayIsoDate(): string {
  return localIsoDate();
}

function fallbackBounds(): TimePreviewBoundsResponse {
  const today = todayIsoDate();
  return {
    minDate: today,
    maxDate: today,
    defaultDate: today,
  };
}

function normalizePersistedDate(
  rawDate: string | null,
  bounds: TimePreviewBoundsResponse,
): string {
  const base = rawDate || bounds.defaultDate;
  return clampIsoDate(
    normalizeToMonthStart(base),
    normalizeToMonthStart(bounds.minDate),
    normalizeToMonthStart(bounds.maxDate),
  );
}

export function TimePreviewProvider({ children }: { children: React.ReactNode }) {
  const [bounds, setBounds] = useState<TimePreviewBoundsResponse | null>(null);
  const [loadingBounds, setLoadingBounds] = useState(true);
  const [asOfDate, setAsOfDateState] = useState<string | undefined>(undefined);
  const [scope, setScope] = useState<TimePreviewScope>({ includeExceptions: false });
  const [latestKpis, setLatestKpis] = useState<KpiResponse | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadBounds(): Promise<void> {
      setLoadingBounds(true);
      try {
        const timelineParams = new URLSearchParams();
        timelineParams.set("currentDate", todayIsoDate());
        const response = await fetch(`/api/dashboard/timeline?${timelineParams.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as TimePreviewBoundsResponse;
        if (!active) {
          return;
        }

        const normalizedBounds: TimePreviewBoundsResponse = {
          minDate: payload.minDate || fallbackBounds().minDate,
          maxDate: payload.maxDate || fallbackBounds().maxDate,
          defaultDate: payload.defaultDate || fallbackBounds().defaultDate,
        };
        setBounds(normalizedBounds);

        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        setAsOfDateState(normalizePersistedDate(stored, normalizedBounds));
      } catch {
        if (!active) {
          return;
        }

        const fallback = fallbackBounds();
        setBounds(fallback);
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        setAsOfDateState(normalizePersistedDate(stored, fallback));
      } finally {
        if (active) {
          setLoadingBounds(false);
        }
      }
    }

    void loadBounds();
    return () => {
      active = false;
    };
  }, []);

  const setAsOfDate = useCallback((date: string) => {
    setAsOfDateState((current) => {
      if (!bounds) {
        return normalizeToMonthStart(date);
      }

      const next = clampIsoDate(
        normalizeToMonthStart(date),
        normalizeToMonthStart(bounds.minDate),
        normalizeToMonthStart(bounds.maxDate),
      );
      if (next === current) {
        return current;
      }

      return next;
    });
  }, [bounds]);

  const resetAsOfDate = useCallback(() => {
    if (!bounds) {
      return;
    }

    setAsOfDateState(normalizePersistedDate(null, bounds));
  }, [bounds]);

  useEffect(() => {
    if (!asOfDate || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, asOfDate);
  }, [asOfDate]);

  useEffect(() => {
    if (!asOfDate) {
      return;
    }

    let active = true;
    const params = new URLSearchParams();
    params.set("includeExceptions", String(scope.includeExceptions));
    if (scope.state) {
      params.set("state", scope.state);
    }
    if (scope.includeOutOfScope) {
      params.set("includeOutOfScope", "true");
    }
    if (scope.includeDecomSites) {
      params.set("includeDecomSites", "true");
    }
    if (scope.affiliate) {
      params.set("affiliate", scope.affiliate);
    }
    if (scope.county) {
      params.set("county", scope.county);
    }
    if (scope.deviceType) {
      params.set("deviceType", scope.deviceType);
    }
    if (scope.siteCodes && scope.siteCodes.length > 0) {
      params.set("siteCode", scope.siteCodes.join(","));
    } else if (scope.siteCode) {
      params.set("siteCode", scope.siteCode);
    }
    params.set("asOfDate", asOfDate);

    async function loadScopeKpis(): Promise<void> {
      setKpisLoading(true);
      try {
        const response = await fetch(`/api/dashboard/kpis?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as KpiResponse;
        if (active) {
          setLatestKpis(payload);
        }
      } catch {
        if (active) {
          setLatestKpis(null);
        }
      } finally {
        if (active) {
          setKpisLoading(false);
        }
      }
    }

    void loadScopeKpis();
    return () => {
      active = false;
    };
  }, [asOfDate, scope]);

  const value = useMemo<TimePreviewContextValue>(() => ({
    asOfDate,
    bounds,
    loadingBounds,
    setAsOfDate,
    resetAsOfDate,
    scope,
    setScope,
    latestKpis,
    kpisLoading,
  }), [asOfDate, bounds, kpisLoading, latestKpis, loadingBounds, resetAsOfDate, scope, setAsOfDate]);

  return <TimePreviewContext.Provider value={value}>{children}</TimePreviewContext.Provider>;
}

export function useTimePreview(): TimePreviewContextValue {
  const context = useContext(TimePreviewContext);
  if (!context) {
    throw new Error("useTimePreview must be used within TimePreviewProvider.");
  }

  return context;
}
