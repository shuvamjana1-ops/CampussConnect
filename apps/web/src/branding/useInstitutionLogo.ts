import { useEffect, useState, useCallback } from 'react';
import {
  getStoredLogo,
  setStoredLogo,
  resetStoredLogo,
  DEFAULT_LOGO_VALUE,
  EVENT_NAME,
  containsEmoji,
} from './logoStorage';

export function useInstitutionLogo() {
  const [logo, setLogoState] = useState<string>(() => getStoredLogo());

  useEffect(() => {
    const handleUpdate = () => {
      setLogoState(getStoredLogo());
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updateLogo = useCallback((newVal: string) => {
    return setStoredLogo(newVal);
  }, []);

  const resetLogo = useCallback(() => {
    resetStoredLogo();
    setLogoState(DEFAULT_LOGO_VALUE);
  }, []);

  return {
    logo,
    updateLogo,
    resetLogo,
    containsEmoji,
    isDefault: logo === DEFAULT_LOGO_VALUE,
  };
}

