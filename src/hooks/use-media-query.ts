import { useEffect, useState } from "react"

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matchMedia(query).matches)

  useEffect(() => {
    function onChange(e: MediaQueryListEvent) {
      setValue(e.matches)
    }

    const result = matchMedia(query)
    result.addEventListener("change", onChange)
    return () => result.removeEventListener("change", onChange)
  }, [query])

  return value
}
