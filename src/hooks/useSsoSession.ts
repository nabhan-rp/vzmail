import { useEffect, useState } from 'react';
import { sanitizeHandle } from '../utils/mailIdentity';

export type CrossServiceOffer =
  | 'offer_links_after_mail'
  | 'offer_mail_after_links'
  | null;

export interface SsoSession {
  isAuthenticated: boolean;
  username: string;
  birthDate: string; // YYYY-MM-DD
  mailActivated: boolean;
  linksActivated: boolean;
  primaryDomain: string;
}

const STORAGE_KEY = 'vz_sso_session_v2';

const DEFAULT_SESSION: SsoSession = {
  isAuthenticated: true,
  username: 'fadhil',
  birthDate: '2001-05-14',
  mailActivated: false,
  linksActivated: false,
  primaryDomain: 'imy.li',
};

const SIGNED_OUT_SESSION: SsoSession = {
  isAuthenticated: false,
  username: '',
  birthDate: '',
  mailActivated: false,
  linksActivated: false,
  primaryDomain: 'imy.li',
};

export function calculateAgeFromDob(birthDate: string): number | null {
  if (!birthDate) return null;
  const parts = birthDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;

  const [year, month, day] = parts;
  const today = new Date();
  const dob = new Date(year, month - 1, day);
  if (Number.isNaN(dob.getTime()) || dob > today) return null;

  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1;
  }
  return age;
}

export function useSsoSession() {
  const [session, setSession] = useState<SsoSession>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SsoSession>;
        if (typeof parsed.isAuthenticated === 'boolean') {
          return {
            isAuthenticated: parsed.isAuthenticated,
            username: sanitizeHandle(parsed.username || 'fadhil'),
            birthDate:
              typeof parsed.birthDate === 'string'
                ? parsed.birthDate
                : '2001-05-14',
            mailActivated: Boolean(parsed.mailActivated),
            linksActivated: Boolean(parsed.linksActivated),
            primaryDomain: parsed.primaryDomain || 'imy.li',
          };
        }
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_SESSION;
  });

  const [crossOffer, setCrossOffer] = useState<CrossServiceOffer>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage errors
    }
  }, [session]);

  const age = session.isAuthenticated
    ? calculateAgeFromDob(session.birthDate)
    : null;
  const isVerifiedAdult21 = Boolean(
    session.isAuthenticated && age !== null && age >= 21
  );

  const signIn = (
    username: string,
    birthDate: string,
    options?: { mailActivated?: boolean; linksActivated?: boolean }
  ) => {
    const cleanUser = sanitizeHandle(username || 'fadhil');
    const nextMail = options?.mailActivated ?? false;
    const nextLinks = options?.linksActivated ?? false;
    setSession({
      isAuthenticated: true,
      username: cleanUser,
      birthDate: birthDate || '2001-05-14',
      mailActivated: nextMail,
      linksActivated: nextLinks,
      primaryDomain: 'imy.li',
    });
    if (nextMail && !nextLinks) {
      setCrossOffer('offer_links_after_mail');
    } else if (nextLinks && !nextMail) {
      setCrossOffer('offer_mail_after_links');
    } else {
      setCrossOffer(null);
    }
  };

  const signOut = () => {
    setSession(SIGNED_OUT_SESSION);
    setCrossOffer(null);
  };

  const activateMail = (triggerCrossOffer = true) => {
    setSession((prev) => {
      const next = { ...prev, mailActivated: true };
      if (triggerCrossOffer && !prev.linksActivated) {
        setCrossOffer('offer_links_after_mail');
      } else {
        setCrossOffer(null);
      }
      return next;
    });
  };

  const deactivateMail = () => {
    setSession((prev) => ({ ...prev, mailActivated: false }));
    setCrossOffer(null);
  };

  const activateLinks = (triggerCrossOffer = true) => {
    setSession((prev) => {
      const next = { ...prev, linksActivated: true };
      if (triggerCrossOffer && !prev.mailActivated) {
        setCrossOffer('offer_mail_after_links');
      } else {
        setCrossOffer(null);
      }
      return next;
    });
  };

  const deactivateLinks = () => {
    setSession((prev) => ({ ...prev, linksActivated: false }));
    setCrossOffer(null);
  };

  const dismissCrossOffer = () => {
    setCrossOffer(null);
  };

  return {
    session,
    age,
    isVerifiedAdult21,
    crossOffer,
    signIn,
    signOut,
    activateMail,
    deactivateMail,
    activateLinks,
    deactivateLinks,
    dismissCrossOffer,
  };
}
