"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/client/api";

/** Loads JSON from `url`, exposing data, error and a reload function. */
export function useLoad<T>(url: string, pick: (body: never) => T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(pick((await api(url)) as never));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
    // `pick` is expected to be a stable inline selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { data, error, setError, reload };
}
