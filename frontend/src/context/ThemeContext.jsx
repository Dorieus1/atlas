import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "atlas_theme";

const ThemeContext = createContext(null);

function readStoredTheme() {

  try {

    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" ? "light" : "dark";

  } catch (e) {

    return "dark";

  }

}

// Defaults to dark and only ever changes when the user explicitly picks
// light in Settings - an existing user's screen should never change out
// from under them just because we shipped a new theme.
function ThemeProvider({ children }) {

  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {

    document.documentElement.setAttribute("data-theme", theme);

    try {

      localStorage.setItem(STORAGE_KEY, theme);

    } catch (e) {}

  }, [theme]);

  const toggleTheme = () => {

    setTheme((previous) => (previous === "dark" ? "light" : "dark"));

  };

  return (

    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>

  );

}

function useTheme() {

  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;

}

export { ThemeProvider, useTheme };
