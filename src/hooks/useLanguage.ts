import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';

const STORAGE_KEY = 'vz_lang';

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'id' || saved === 'en') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'id';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  return { lang, setLang: setLangState };
}
