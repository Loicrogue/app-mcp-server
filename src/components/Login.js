import { useState } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
} from 'aws-amplify/auth';

// Connexion / inscription Cognito (email + mot de passe).
// À l'inscription, un code de vérification est envoyé par email.
export default function Login({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'confirm'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'signin') {
      setLoading(true);
      try {
        await signIn({ username: email, password });
        onSignedIn();
      } catch (err) {
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    } else if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Les deux mots de passe ne correspondent pas.');
        return;
      }
      setLoading(true);
      try {
        await signUp({
          username: email,
          password,
          options: { userAttributes: { email } },
        });
        setMode('confirm');
      } catch (err) {
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    } else {
      // 'confirm' : valider le code reçu par email
      setLoading(true);
      try {
        await confirmSignUp({ username: email, confirmationCode: code });
        await signIn({ username: email, password });
        onSignedIn();
      } catch (err) {
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="auth-card">
      <h2>Serveur MCP — Connexion</h2>

      {mode === 'confirm' ? (
        <p className="info">
          Un code de vérification a été envoyé à <strong>{email}</strong>.
          Saisis-le ci-dessous.
        </p>
      ) : (
        <p className="info">
          Accès sécurisé par Amazon Cognito (email + mot de passe).
        </p>
      )}

      <form onSubmit={handleSubmit}>
        {mode !== 'confirm' && (
          <>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={8}
              />
            </label>
          </>
        )}

        {mode === 'signup' && (
          <label>
            Confirmer le mot de passe
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        )}

        {mode === 'confirm' && (
          <label>
            Code de vérification
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading
            ? 'Patientez…'
            : mode === 'signin'
              ? 'Se connecter'
              : mode === 'signup'
                ? 'Créer le compte'
                : 'Valider le code'}
        </button>
      </form>

      <div className="auth-switch">
        {mode === 'signin' ? (
          <button className="link" onClick={() => { setMode('signup'); setError(''); }}>
            Pas encore de compte ? S'inscrire
          </button>
        ) : (
          <button className="link" onClick={() => { setMode('signin'); setError(''); }}>
            Déjà un compte ? Se connecter
          </button>
        )}

        {mode === 'confirm' && (
          <button
            className="link"
            onClick={() => resendSignUpCode({ username: email }).catch((err) => setError(err.message))}
          >
            Renvoyer le code
          </button>
        )}
      </div>
    </div>
  );
}