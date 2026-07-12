'use client';

import { createContext, useContext } from 'react';

const noop = () => {};
const ThemeContext = createContext({ theme: 'dark', toggleTheme: noop });

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: noop }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
