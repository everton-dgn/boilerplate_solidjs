import { createContext, createSignal, useContext } from "solid-js"
import type { Accessor, ParentComponent } from "solid-js"

type Theme = "light" | "dark"

type Preferences = {
  theme: Accessor<Theme>
  toggleTheme: () => void
}

const PreferencesContext = createContext<Preferences>()

export const PreferencesProvider: ParentComponent = props => {
  const [theme, setTheme] = createSignal<Theme>("light")
  const preferences: Preferences = {
    theme,
    toggleTheme: () => setTheme(current => current === "light" ? "dark" : "light")
  }

  return (
    <PreferencesContext value={preferences}>
      {props.children}
    </PreferencesContext>
  )
}

export function usePreferences() {
  return useContext(PreferencesContext)
}

export function ThemeSelector() {
  const preferences = usePreferences()

  return (
    <button
      type="button"
      aria-pressed={preferences.theme() === "dark" ? "true" : "false"}
      onClick={preferences.toggleTheme}
    >
      Tema escuro
    </button>
  )
}
