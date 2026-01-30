"use client";

import { useState, useEffect, useCallback } from "react";
import { api, User } from "@/lib/api";
import { getStoredRefreshToken, getStoredToken, isTokenValid } from "@/lib/auth";

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    const refreshToken = getStoredRefreshToken();

    // Ensure the API client picks up the stored token (module may have been
    // evaluated during SSR, leaving the in-memory token empty).
    if (token && isTokenValid(token)) {
      api.setToken(token);
    } else if (refreshToken) {
      // Try to keep the user logged in by refreshing the access token.
      try {
        await api.refresh(refreshToken);
      } catch {
        api.clearToken();
        setUser(null);
        setIsLoading(false);
        return;
      }
    } else {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch {
      api.clearToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    await refreshUser();
  }, [refreshUser]);

  const register = useCallback(async (email: string, username: string, password: string) => {
    await api.register(email, username, password);
    await api.login(email, password);
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };
}
