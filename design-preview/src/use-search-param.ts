import { useState, useCallback } from 'react';

export function useSearchParam(
  key: string,
  defaultValue: string,
): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    return new URLSearchParams(window.location.search).get(key) ?? defaultValue;
  });

  const set = useCallback(
    (v: string) => {
      const params = new URLSearchParams(window.location.search);
      if (v) {
        params.set(key, v);
      } else {
        params.delete(key);
      }
      window.history.replaceState(null, '', `?${params.toString()}`);
      setValue(v);
    },
    [key],
  );

  return [value, set];
}
