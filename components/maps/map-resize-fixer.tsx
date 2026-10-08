"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export function MapResizeFixer() {
  const map = useMap();

  useEffect(() => {
    const refresh = () => map.invalidateSize({ pan: false });

    refresh();
    const timer = window.setTimeout(refresh, 120);

    const observer = new ResizeObserver(() => refresh());
    observer.observe(map.getContainer());

    window.addEventListener("resize", refresh);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [map]);

  return null;
}
