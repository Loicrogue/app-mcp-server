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
  const [mfa, setMfa] = useState(null); // null | { preferred?: 'TOTP'|'SMS', enabled: ('TOTP'|'SMS')[] }
  const [setupUri, setSetupUri] = useState(null); // URI otpauth:// (QR + texte)
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(''); // échec de lecture de l'état MFA

  async function loadMfa() {
    setLoading(true);
    setLoadError('');
    try {
      const pref = await fetchMFAPreference();
      setMfa(pref);
    } catch (err) {
      // Un échec ne doit JAMAIS laisser croire que le TOTP est inactif :
      // l'état reste inconnu, on l'affiche et on propose de réessayer.
      setMfa(null);
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMfa();
  }, []);

  const totpEnabled = mfa?.enabled?.includes('TOTP') ?? false;
  const totpPreferred = mfa?.preferred === 'TOTP';
  const isGoogleAccount = username?.startsWith('google_');

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
      await verifyTOTPSetup({ code });
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

  // État MFA illisible : on n'affiche PAS le bouton d'activation, sinon
  // l'utilisateur croirait que le TOTP est inactif alors qu'il l'est peut-être.
  if (loadError) {
    return (
      <div>
        <h2>Sécurité</h2>
        <section>
          <h3>Authentification à deux facteurs (TOTP)</h3>
          <p className="error">Impossible de lire l'état MFA : {loadError}</p>
          <button onClick={loadMfa}>Réessayer</button>
          <p className="muted">
            Astuce : si le compte a été créé via le SSO Google (sans mot de
            passe Cognito), le TOTP Cognito peut être indisponible ; vérifie
            l'état dans la console AWS (Cognito → utilisateur → MFA).
          </p>
        </section>
      </div>
    );
  }

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
        <p className="muted">État renvoyé par Cognito : {JSON.stringify(mfa)}</p>

        {setupUri ? (
          <div className="totp-setup">
            <p className="info">
              Scanner ce QR code avec l'application d'authentification, puis
              confirmer le code affiché.
            </p>
            <QRCodeSVG className="totp-qr" value={setupUri} size={180} />
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
              TOTP actif ({totpPreferred ? 'préféré' : 'activé'}).
            </p>
            <button onClick={handleDisable}>Désactiver le TOTP</button>
          </div>
        ) : (
          <div>
            {isGoogleAccount && (
              <p className="muted">
                Le TOTP Cognito n'est pas disponible pour les comptes
                connectés via Google : l'authentification est gérée par
                Google.
              </p>
            )}
            <button
              onClick={handleStartSetup}
              disabled={isGoogleAccount}
            >
              Activer le TOTP
            </button>
          </div>
        )}

        {error && <p className="error">Erreur : {error}</p>}
      </section>
    </div>
  );
}