import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../services/supabase";
import { technicalAuthEmail } from "../utils/auth";
import { AuthContext } from "./AuthContextValue";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionIssue, setSessionIssue] = useState("");
  const [mfaRequired, setMfaRequired] = useState(true);
  const intentionalLogout = useRef(false);

  const loadProfile = useCallback(async (nextSession) => {
    if (!nextSession) {
      setSession(null);
      setProfile(null);
      setMfaRequired(true);
      setLoading(false);
      return false;
    }

    const { data, error } = await supabase.rpc("get_current_employee_profile");
    const currentProfile = Array.isArray(data) ? data[0] : data;
    if (error || !currentProfile?.activo || !["admin", "empleado"].includes(currentProfile.rol)) {
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setProfile(null);
      setSessionIssue("Tu sesión ya no está disponible. Ingresá nuevamente.");
      setLoading(false);
      return false;
    }

    setSession(nextSession);
    setProfile(currentProfile);
    if (currentProfile.rol === "admin") {
      setMfaRequired(true);
      try {
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setMfaRequired(Boolean(assuranceError) || assurance?.currentLevel !== "aal2");
      } catch {
        setMfaRequired(true);
      }
    } else {
      setMfaRequired(false);
    }
    setSessionIssue("");
    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setSessionIssue("No se pudo verificar la sesión. Ingresá nuevamente.");
        setLoading(false);
        return;
      }
      loadProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !nextSession) {
        setSession(null);
        setProfile(null);
        setMfaRequired(true);
        setLoading(false);
        if (!intentionalLogout.current) {
          setSessionIssue("La sesión venció. Ingresá nuevamente.");
        }
        intentionalLogout.current = false;
        return;
      }
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION", "MFA_CHALLENGE_VERIFIED"].includes(event)) {
        queueMicrotask(() => mounted && loadProfile(nextSession));
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (username, password) => {
    setLoading(true);
    setSessionIssue("");
    try {
      const email = technicalAuthEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error("invalid_credentials");
      const valid = await loadProfile(data.session);
      if (!valid) throw new Error("profile_unavailable");
      return data.session;
    } catch (error) {
      setLoading(false);
      throw error;
    }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    setLoading(true);
    intentionalLogout.current = true;
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    setProfile(null);
    setMfaRequired(true);
    setSessionIssue("");
    setLoading(false);
  }, []);

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    sessionIssue,
    mfaRequired,
    signIn,
    signOut,
    refreshProfile: () => loadProfile(session),
  }), [session, profile, loading, sessionIssue, mfaRequired, signIn, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

