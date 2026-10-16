/**
 * @file plugin-host/sessionStartup.tsx
 * @description Gates external commands until session initialization has settled.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface StartupState {
  ready: boolean
  errors: readonly string[]
  complete(errors: readonly string[]): void
}

const StartupContext = createContext<StartupState>({ ready: true, errors: [], complete: () => {} })

/** One startup barrier for the main window; standalone components need no barrier. */
export function SessionStartupProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [result, setResult] = useState<{ ready: boolean; errors: readonly string[] }>({ ready: false, errors: [] })
  const complete = useCallback((errors: readonly string[]) => setResult({ ready: true, errors }), [])
  const value = useMemo(() => ({ ...result, complete }), [result, complete])
  return <StartupContext.Provider value={value}>{children}</StartupContext.Provider>
}

/** Startup completion and diagnostics shared by the shell and local API endpoints. */
export function useSessionStartup(): StartupState {
  return useContext(StartupContext)
}
