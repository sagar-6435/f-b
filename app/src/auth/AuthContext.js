import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { syncDevicePushToken } from '../notifications/pushNotifications';

const AUTH_STORAGE_KEY = '@fresh_basket_auth_state';

const normalizePhone = (value) => value.replace(/\D/g, '');

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isReady, setIsReady]               = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [phoneNumber, setPhoneNumber]       = useState(null);
  const [userProfile, setUserProfile]       = useState(null);

  /** Load user profile from backend. Returns null only on 404, throws on network error. */
  const loadProfile = async (phone) => {
    try {
      return await api.get(`/users/${normalizePhone(phone)}`);
    } catch (err) {
      // If it's a network error (backend unreachable), don't wipe the session —
      // let the user in and retry profile sync later.
      const msg = err?.message ?? '';
      if (
        msg.includes('Network request failed') ||
        msg.includes('fetch') ||
        msg.includes('timeout')
      ) {
        return 'network_error';
      }
      // 404 or other server error — profile truly missing
      return null;
    }
  };

  /** Update the current user's profile fields. */
  const updateProfile = async (updates) => {
    if (!phoneNumber) throw new Error('No authenticated user found.');
    const userId = normalizePhone(phoneNumber);
    const nextProfile = await api.put(`/users/${userId}`, {
      ...(userProfile ?? {}),
      ...updates,
      phoneNumber,
    });
    setUserProfile(nextProfile);
    return nextProfile;
  };

  // Restore persisted session on app start
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.isAuthenticated && parsed?.phoneNumber) {
            const profile = await loadProfile(parsed.phoneNumber);

            if (profile === 'network_error') {
              // Backend unreachable (cold start, offline) — trust the stored
              // session and let the user in without a profile for now.
              setPhoneNumber(parsed.phoneNumber);
              setUserProfile(null);
              setIsAuthenticated(true);
            } else if (profile) {
              setPhoneNumber(parsed.phoneNumber);
              setUserProfile(profile);
              setIsAuthenticated(true);
            } else {
              // Server confirmed user doesn't exist — clear stale session
              await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
            }
          }
        }
      } catch {
        // AsyncStorage read error — don't block the app
      } finally {
        setIsReady(true);
      }
    };

    restore();
  }, []);

  // Sync push token after login + retry profile load if it was missing due to network error
  useEffect(() => {
    if (!isReady || !isAuthenticated || !phoneNumber) return;

    // If profile wasn't loaded (network error during restore), retry now
    if (!userProfile) {
      loadProfile(phoneNumber).then((profile) => {
        if (profile && profile !== 'network_error') setUserProfile(profile);
      }).catch(() => {});
    }

    syncDevicePushToken(normalizePhone(phoneNumber)).catch(() => {});
  }, [isReady, isAuthenticated, phoneNumber]);

  /**
   * Step 1 — request OTP via backend → Twilio SMS.
   */
  const sendOtp = async (phone) => {
    await api.post('/auth/send-otp', { phone });
  };

  /**
   * Bypass — skip OTP verification entirely.
   * Loads the user profile directly and sets auth state.
   * Used in development / testing builds.
   */
  const bypassOtp = async (phone) => {
    const userId = normalizePhone(phone);
    let profile  = await loadProfile(phone);
    if (!profile || profile === 'network_error') {
      profile = await api.put(`/users/${userId}`, {
        phoneNumber: phone,
        displayName: 'Fresh Basket User',
        role: 'customer',
      });
    }
    setPhoneNumber(phone);
    setUserProfile(profile);
    setIsAuthenticated(true);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ isAuthenticated: true, phoneNumber: phone }),
    );
    return profile;
  };

  /**
   * Step 2 — verify OTP with backend.
   * On success, persist the session and load the user profile.
   */
  const confirmOtp = async (phone, code) => {
    // Throws if code is wrong or expired
    await api.post('/auth/verify-otp', { phone, code });

    // OTP verified — load or create the user profile
    const userId  = normalizePhone(phone);
    let profile   = await loadProfile(phone);
    if (!profile) {
      profile = await api.put(`/users/${userId}`, {
        phoneNumber: phone,
        displayName: 'Fresh Basket User',
        role: 'customer',
      });
    }

    setPhoneNumber(phone);
    setUserProfile(profile);
    setIsAuthenticated(true);

    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ isAuthenticated: true, phoneNumber: phone }),
    );

    return profile;
  };

  const signOut = async () => {
    setIsAuthenticated(false);
    setPhoneNumber(null);
    setUserProfile(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const value = useMemo(
    () => ({ isReady, isAuthenticated, phoneNumber, userProfile, sendOtp, confirmOtp, bypassOtp, signOut, updateProfile }),
    [isReady, isAuthenticated, phoneNumber, userProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
