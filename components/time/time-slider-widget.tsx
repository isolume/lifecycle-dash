"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTimePreview } from "./time-preview-provider";

function isVisibleRoute(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return (
    pathname.startsWith("/heatmap") ||
    pathname.startsWith("/map/") ||
    pathname.startsWith("/dashboard/list/") ||
    pathname.startsWith("/breakdown") ||
    pathname.startsWith("/devices") ||
    pathname.startsWith("/radius-groups")
  );
}

function toMonthIndex(isoDate: string): number {
  const [yearRaw, monthRaw] = isoDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return year * 12 + Math.max(0, month - 1);
}

function toIsoDateFromMonthIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function formatMonthLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function TimeSliderWidget() {
  const pathname = usePathname();
  const {
    asOfDate,
    bounds,
    loadingBounds,
    setAsOfDate,
    resetAsOfDate,
    latestKpis,
    kpisLoading,
  } = useTimePreview();
  const [isOpen, setIsOpen] = useState(false);
  const [sliderIndex, setSliderIndex] = useState<number | null>(null);

  const visible = isVisibleRoute(pathname);
  const minIndex = bounds ? toMonthIndex(bounds.minDate) : 0;
  const maxIndex = bounds ? toMonthIndex(bounds.maxDate) : 0;

  const currentSliderIndex =
    sliderIndex ?? (asOfDate ? toMonthIndex(asOfDate) : minIndex);

  useEffect(() => {
    if (!bounds || sliderIndex === null) {
      return;
    }

    const nextDate = toIsoDateFromMonthIndex(sliderIndex);
    const timer = window.setTimeout(() => {
      if (nextDate !== asOfDate) {
        setAsOfDate(nextDate);
      }
      setSliderIndex(null);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [asOfDate, bounds, setAsOfDate, sliderIndex]);

  const selectedLabel = useMemo(
    () => (asOfDate ? formatMonthLabel(asOfDate) : "Loading"),
    [asOfDate],
  );

  if (!visible) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="time-slider-launcher"
        style={{ left: "0.5rem", right: "auto" }}
        onClick={() => {
          setSliderIndex(asOfDate ? toMonthIndex(asOfDate) : minIndex);
          setIsOpen(true);
        }}
        aria-label="Open time preview"
      >
        <span className="time-slider-launcher-title">Time Preview</span>
        <span className="time-slider-launcher-value">{selectedLabel}</span>
      </button>
    );
  }

  return (
    <section
      className="time-slider-widget"
      style={{ left: "0.5rem", right: "auto" }}
      aria-label="Time preview slider"
    >
      <header className="time-slider-header">
        <div>
          <h2 className="time-slider-title">Time Preview</h2>
          <p className="time-slider-subtitle">Forecast month</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSliderIndex(null);
            setIsOpen(false);
          }}
          className="time-slider-close-btn"
          aria-label="Close time slider"
        >
          Close
        </button>
      </header>

      <div className="time-slider-content">
        <div className="time-slider-value-row">
          <span className="time-slider-selected">{selectedLabel}</span>
          <button
            type="button"
            className="time-slider-reset-btn"
            onClick={() => {
              setSliderIndex(null);
              resetAsOfDate();
            }}
            disabled={loadingBounds}
          >
            Reset
          </button>
        </div>

        <input
          type="range"
          min={minIndex}
          max={maxIndex}
          step={1}
          value={currentSliderIndex}
          onChange={(event) => setSliderIndex(Number(event.target.value))}
          className="time-slider-input"
          disabled={loadingBounds || !bounds}
        />

        <div className="time-slider-range-labels">
          <span>{bounds ? formatMonthLabel(bounds.minDate) : "-"}</span>
          <span>{bounds ? formatMonthLabel(bounds.maxDate) : "-"}</span>
        </div>

        <div className="time-slider-kpis">
          <div className="time-slider-kpi">
            <span className="time-slider-kpi-label">Past EoL</span>
            <span className="time-slider-kpi-value">
              {kpisLoading ? "..." : (latestKpis?.pastEolDevices ?? 0).toLocaleString("en-US")}
            </span>
          </div>
          <div className="time-slider-kpi">
            <span className="time-slider-kpi-label">High Risk</span>
            <span className="time-slider-kpi-value">
              {kpisLoading ? "..." : (latestKpis?.highRiskDevices ?? 0).toLocaleString("en-US")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
