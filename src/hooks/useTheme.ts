import { useEffect, useState } from 'react';
import { bitable } from '@lark-base-open/js-sdk';

export type Theme = 'LIGHT' | 'DARK';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('LIGHT');

  useEffect(() => {
    const init = async () => {
      try {
        const t = await bitable.bridge.getTheme();
        setTheme(t as Theme);
      } catch {
        setTheme('LIGHT');
      }
    };
    init();

    const off = bitable.bridge.onThemeChange((event) => {
      setTheme(event.data.theme as Theme);
    });

    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'DARK') {
      root.classList.add('theme-dark');
    } else {
      root.classList.remove('theme-dark');
    }
  }, [theme]);

  return theme;
}
