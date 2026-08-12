import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  fetchMFAPreference,
  setUpTOTP,
  updateMFAPreference,
  verifyTOTPSetup,
} from 'aws-amplify/auth';

// Onglet Sécurité : état du MFA + activation TOTP (app d'authentification).
// Flux : setupTOTP() fournit le secret partagé (QR) -> verifyTOTPSetup(code)
// -> updateMFAPreference({ totp: 'PREFERRED' }) pour activer le TOTP.
export default function Security({ username }) {
  const [mfa, setMfa] = useState(null); // null | { totp: 'ENABLED'|'PREFERRED'|'DISABLED'|'NOT_SET', ... }
  const [setupUri, setSetupUri] = useState(null); // URI otpauth:// (QR + texte)
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadMfa() {
    setLoading(true);
    try {
      const pref = await fetchMFAPreference();
      setMfa(pref);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMfa();
  }, []);

  const totpEnabled = mfa?.totp === 'ENABLED' || mfa?.totp === 'PREFERRED';

  async function handleStartSetup() {
    setError('');
    setSetupUri(null);
    try {
      const res = await setUpTOTP();
      const uri = res.getSetupUri('Serveur MCP', username);
      setSetupUri(uri.toString());
    } catch (err) {
      setError(err.message ?? String(err));
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    try {
      await verifyTOTPSetup({ confirmationCode: code });
      await updateMFAPreference({ totp: 'PREFERRED' });
      setSetupUri(null);
      setCode('');
      await loadMfa();
    } catch (err) {
      setError(err.message ?? String(err));
    }
  }

  async function handleDisable() {
    setError('');
    try {
      await updateMFAPreference({ totp: 'DISABLED' });
      await loadMfa();
    } catch (err) {
      setError(err.message ?? String(err));
    }
  }

  if (loading) return <p>Chargement des paramètres de sécurité…</p>;

  return (
    <div>
      <h2>Sécurité</h2>

      <section>
        <h3>Authentification à deux facteurs (TOTP)</h3>
        <p className="muted">
          Active une application d'authentification (Google Authenticator,
          1Password, Authy…) pour protéger la connexion. Le code à 6 chiffres
          sera demandé à chaque connexion.
        </p>

        {setupUri ? (
          <div className="totp-setup">
            <p className="info">
              Scanner ce QR code avec l'application d'authentification, puis
              confirmer le code affiché.
            </p>
            <QRCodeSVG value={setupUri} size={180} />
            <p className="muted break-all">{setupUri}</p>
            <form onSubmit={handleVerify}>
              <label>
                Code à 6 chiffres
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <button type="submit">Activer le TOTP</button>
              <button
                type="button"
                className="link"
                onClick={() => setSetupUri(null)}
              >
                Annuler
              </button>
            </form>
          </div>
        ) : totpEnabled ? (
          <div>
            <p className="muted">
              TOTP actif ({mfa.totp === 'PREFERRED' ? 'préféré' : 'activé'}).
            </p>
            <button onClick={handleDisable}>Désactiver le TOTP</button>
          </div>
        ) : (
          <button onClick={handleStartSetup}>Activer le TOTP</button>
        )}

        {error && <p className="error">Erreur : {error}</p>}
      </section>
    </div>
  );
}