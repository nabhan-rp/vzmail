import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAuth0Config } from '../utils/auth0Config';
import { sanitizeHandle } from '../utils/mailIdentity';

export type CrossServiceOffer =
  | 'offer_links_after_mail'
  | 'offer_mail_after_links'
  | null;

export interface SsoSession {
  isAuthenticated: boolean;
  authProvider: 'auth0' | 'local';
  username: string;
  birthDate: string; // YYYY-MM-DD
  mailActivated: boolean;
  linksActivated: boolean;
  primaryDomain: string;
  email?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

interface UserModulePrefs {
  birthDate: string;
  mailActivated: boolean;
  linksActivated: boolean;
  primaryDomain: string;
}

const MODULE_PREFS_KEY = 'vz_sso_module_prefs_v3';
export const ADMIN_OWNER_EMAIL = 'nabhanraflipratama.id@gmail.com';

const DEFAULT_PREFS: UserModulePrefs = {
  birthDate: '2001-05-14',
  mailActivated: false,
  linksActivated: false,
  primaryDomain: 'imy.li',
};

const SIGNED_OUT_SESSION: SsoSession = {
  isAuthenticated: false,
  authProvider: 'auth0',
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

function readAllPrefs(): Record<string, UserModulePrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MODULE_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<UserModulePrefs>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, UserModulePrefs> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v === 'object') {
        out[k] = {
          birthDate:
            typeof v.birthDate === 'string'
              ? v.birthDate
              : DEFAULT_PREFS.birthDate,
          mailActivated: Boolean(v.mailActivated),
          linksActivated: Boolean(v.linksActivated),
          primaryDomain:
            typeof v.primaryDomain === 'string' && v.primaryDomain
              ? v.primaryDomain
              : DEFAULT_PREFS.primaryDomain,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function deriveHandleFromAuth0User(user: {
  nickname?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  sub?: string;
}): string {
  const candidate =
    user.preferred_username ||
    user.nickname ||
    (user.email ? user.email.split('@')[0] : '') ||
    user.name ||
    user.sub?.split('|').pop() ||
    'user';
  return sanitizeHandle(candidate);
}

export function useSsoSession() {
  const {
    isLoading,
    isAuthenticated: auth0Authenticated,
    error: authError,
    user: auth0User,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();

  const auth0Config = useMemo(() => resolveAuth0Config(), []);
  const auth0Domain = auth0Config.domain;

  const [prefsMap, setPrefsMap] = useState<Record<string, UserModulePrefs>>(() =>
    readAllPrefs()
  );

  const [crossOffer, setCrossOffer] = useState<CrossServiceOffer>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MODULE_PREFS_KEY, JSON.stringify(prefsMap));
    } catch {
      // Ignore storage errors
    }
  }, [prefsMap]);

  const auth0Key = useMemo(() => {
    if (!auth0Authenticated || !auth0User) return null;
    return auth0User.sub || deriveHandleFromAuth0User(auth0User);
  }, [auth0Authenticated, auth0User]);

  const session: SsoSession = useMemo(() => {
    if (auth0Authenticated && auth0User && auth0Key) {
      const prefs = prefsMap[auth0Key] || DEFAULT_PREFS;
      const username = deriveHandleFromAuth0User(auth0User);
      return {
        isAuthenticated: true,
        authProvider: 'auth0',
        username,
        birthDate: prefs.birthDate,
        mailActivated: prefs.mailActivated,
        linksActivated: prefs.linksActivated,
        primaryDomain: prefs.primaryDomain,
        email: auth0User.email,
        name: auth0User.name,
        picture: auth0User.picture,
        sub: auth0User.sub,
      };
    }

    return SIGNED_OUT_SESSION;
  }, [auth0Authenticated, auth0User, auth0Key, prefsMap]);

  const isAdminOwner = useMemo(() => {
    return Boolean(
      auth0Authenticated &&
        auth0User?.email &&
        auth0User.email.toLowerCase() === ADMIN_OWNER_EMAIL
    );
  }, [auth0Authenticated, auth0User]);

  const age = session.isAuthenticated
    ? calculateAgeFromDob(session.birthDate)
    : null;
  const isVerifiedAdult21 = Boolean(
    session.isAuthenticated && age !== null && age >= 21
  );

  const loginWithAuth0 = useCallback(() => {
    void loginWithRedirect();
  }, [loginWithRedirect]);

  const signupWithAuth0 = useCallback(() => {
    void loginWithRedirect({
      authorizationParams: {
        screen_hint: 'signup',
      },
    });
  }, [loginWithRedirect]);

  const signOut = useCallback(() => {
    setCrossOffer(null);
    if (auth0Authenticated) {
      void auth0Logout({
        logoutParams: {
          returnTo: auth0Config.logoutReturnTo || undefined,
        },
      });
    }
  }, [auth0Authenticated, auth0Logout, auth0Config.logoutReturnTo]);

  const updateActivePrefs = useCallback(
    (updater: (prev: UserModulePrefs) => UserModulePrefs) => {
      if (auth0Authenticated && auth0Key) {
        setPrefsMap((prevMap) => {
          const current = prevMap[auth0Key] || DEFAULT_PREFS;
          return {
            ...prevMap,
            [auth0Key]: updater(current),
          };
        });
      }
    },
    [auth0Authenticated, auth0Key]
  );

  const activateMail = useCallback(
    (triggerCrossOffer = true) => {
      updateActivePrefs((prev) => {
        if (triggerCrossOffer && !prev.linksActivated) {
          setCrossOffer('offer_links_after_mail');
        } else {
          setCrossOffer(null);
        }
        return { ...prev, mailActivated: true };
      });
    },
    [updateActivePrefs]
  );

  const deactivateMail = useCallback(() => {
    updateActivePrefs((prev) => ({ ...prev, mailActivated: false }));
    setCrossOffer(null);
  }, [updateActivePrefs]);

  const activateLinks = useCallback(
    (triggerCrossOffer = true) => {
      updateActivePrefs((prev) => {
        if (triggerCrossOffer && !prev.mailActivated) {
          setCrossOffer('offer_mail_after_links');
        } else {
          setCrossOffer(null);
        }
        return { ...prev, linksActivated: true };
      });
    },
    [updateActivePrefs]
  );

  const deactivateLinks = useCallback(() => {
    updateActivePrefs((prev) => ({ ...prev, linksActivated: false }));
    setCrossOffer(null);
  }, [updateActivePrefs]);

  const dismissCrossOffer = useCallback(() => {
    setCrossOffer(null);
  }, []);

  return {
    session,
    isAdminOwner,
    isLoading,
    authError: authError ?? null,
    auth0Domain,
    auth0ClientId: auth0Config.clientId,
    auth0AppName: auth0Config.appName,
    auth0Service: auth0Config.service,
    age,
    isVerifiedAdult21,
    crossOffer,
    loginWithAuth0,
    signupWithAuth0,
    signOut,
    activateMail,
    deactivateMail,
    activateLinks,
    deactivateLinks,
    dismissCrossOffer,
  };
}
