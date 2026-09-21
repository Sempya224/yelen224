'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// mode = préférence choisie par l'utilisateur ('system' = suit l'OS en
// permanence). theme = valeur résolue ('light'|'dark') que les pages
// consomment déjà partout via `const { theme } = useTheme(); const C =
// T[theme];` — signature volontairement conservée pour ne rien casser côté
// appelants existants. Avant cette évolution, le provider ne connaissait que
// 'light'|'dark' : il démarrait sur l'OS mais l'oubliait définitivement dès
// le premier clic sur ThemeToggle, sans moyen de revenir à "Système".
export type ThemeMode = 'system' | 'light' | 'dark';
type Theme = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  theme: 'light',
  setMode: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'yelen224-theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Lecture localStorage/matchMedia (indisponibles côté serveur) puis premier
  // rendu client réel — ne peut pas être calculé pendant le rendu, geste
  // volontairement laissé tel quel (composant partagé par tout le produit,
  // pas de changement de timing d'hydratation pendant le gel sécurité).
  useEffect(() => {
    // Valeurs historiques : seulement 'light'|'dark' (override manuel) ou
    // rien (= système). 'system' est une valeur explicite ajoutée ici.
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialMode: ThemeMode = stored === 'light' || stored === 'dark' ? stored : 'system';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(initialMode);
    setTheme(initialMode === 'system' ? getSystemTheme() : initialMode);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme, mounted]);

  // Suit les changements OS en temps réel — uniquement tant que le mode
  // reste 'system' (un choix explicite Clair/Sombre ne doit plus bouger
  // tout seul quand l'OS change).
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      setTheme(getSystemTheme());
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      setTheme(next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setMode]);

  // Évite le flash au chargement
  if (!mounted) return <>{children}</>;

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);