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

  /** Load user profile from backend. Returns null if not found. */
  const loadProfile = async (phone) => {
    try {
      return await api.get(`/users/${normalizePhone(phone)}`);
    } catch {
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
            if (profile) {
              setPhoneNumber(parsed.phoneNumber);
              setUserProfile(profile);
              setIsAuthenticated(true);
            } else {
              // Profile gone — clear stale session
              await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
            }
          }
        }
      } catch {
        // ignore restore errors
      } finally {
        setIsReady(true);
      }
    };

    restore();
  }, []);

  // Sync push token after login
  useEffect(() => {
    if (!isReady || !isAuthenticated || !phoneNumber) return;
    syncDevicePushToken(normalizePhone(phoneNumber)).catch(() => {});
  }, [isReady, isAuthenticated, phoneNumber]);

  /**
   * Step 1 — request OTP via backend → Twilio SMS.
   */
  const sendOtp = async (phone) => {
    await api.post('/auth/send-otp', { phone });
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
    () => ({ isReady, isAuthenticated, phoneNumber, userProfile, sendOtp, confirmOtp, signOut, updateProfile }),
    [isReady, isAuthenticated, phoneNumber, userProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
