import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useAuth } from "../hooks/useAuth";

export default function AdminMfa() {
  const { refreshProfile, signOut } = useAuth();
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      const verified = (data?.totp || []).filter(factor => factor.status === "verified");
      setFactors(verified);
      setFactorId(verified[0]?.id || "");
      if (error) setMessage("No pudimos verificar tus factores. Reintentá ingresando nuevamente.");
      setBusy(false);
    }).catch(() => {
      if (active) {
        setMessage("No pudimos verificar tus factores. Reintentá ingresando nuevamente.");
        setBusy(false);
      }
    });
    return () => { active = false; };
  }, []);

  const enroll = async () => {
    setBusy(true); setMessage("");
    try {
      // Explicit action prevents duplicate enrollments under StrictMode.
      const { data: listed, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of (listed?.all || []).filter(item => item.factor_type === "totp" && item.status === "unverified")) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Administración" });
      if (error || !data?.totp?.qr_code) throw error || new Error("enroll_failed");
      setFactorId(data.id);
      setQr(data.totp.qr_code.startsWith("data:") ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`);
    } catch {
      setMessage("No pudimos configurar el autenticador. Reintentá.");
    } finally { setBusy(false); }
  };

  const verify = async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || !factorId) {
      setMessage("Ingresá los seis dígitos del autenticador."); return;
    }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setCode(""); setQr("");
      await refreshProfile();
    } catch {
      setCode("");
      setMessage("No pudimos verificar el código. Usá uno vigente e intentá nuevamente.");
    } finally { setBusy(false); }
  };

  return (
    <main className="login-stage">
      <section className="login-panel" aria-labelledby="mfa-title" aria-busy={busy}>
        <h1 id="mfa-title">Verificación de administración</h1>
        <p>Para acceder, confirmá tu identidad con una aplicación de autenticación.</p>
        {!factors.length && !qr && <button className="button button--primary" onClick={enroll} disabled={busy}>Configurar autenticador</button>}
        {qr && <img src={qr} alt="Código QR para vincular tu aplicación de autenticación" width="240" height="240" />}
        {factorId && <form className="auth-form" onSubmit={verify}>
          {factors.length > 1 && <div className="form-field"><label htmlFor="mfa-factor">Autenticador</label><select id="mfa-factor" value={factorId} disabled={busy} onChange={event => setFactorId(event.target.value)}>{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Autenticador ${index + 1}`}</option>)}</select></div>}
          <div className="form-field"><label htmlFor="mfa-code">Código de autenticación</label><input id="mfa-code" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></div>
          <button className="button button--primary" disabled={busy} type="submit">{busy ? "Verificando…" : "Verificar código"}</button>
        </form>}
        {message && <p className="form-message form-message--error" role="alert">{message}</p>}
        <p>Si perdiste tu autenticador, contactá al responsable de recuperación por el canal privado acordado.</p>
        <button className="button button--secondary" type="button" disabled={busy} onClick={signOut}>Cerrar sesión</button>
      </section>
    </main>
  );
}
