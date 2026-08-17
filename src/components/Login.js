import { useEffect, useState } from 'react';
import {
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';

// Connexion / inscription Cognito (email + mot de passe ou SSO Google).
// À l'inscription, un code de vérification est envoyé par email.
// Si l'utilisateur a activé le TOTP (onglet Sécurité), le login bascule
// sur la saisie du code à 6 chiffres (CONFIRM_SIGN_IN_WITH_TOTP_CODE).

function formatAuthError(err) {
  const message = err?.message ?? String(err);
  if (message.includes('NotAuthorizedException')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (message.includes('UserNotFoundException')) {
    return 'Aucun compte trouvé avec cet email.';
  }
  if (message.includes('PasswordResetRequiredException')) {
    return 'Vous devez réinitialiser votre mot de passe.';
  }
  if (message.includes('TooManyRequestsException')) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }
  if (message.includes('UserNotConfirmedException')) {
    return "Votre compte n'a pas été confirmé. Vérifiez votre email.";
  }
  if (message.includes('CodeMismatchException')) {
    return 'Code de vérification incorrect.';
  }
  if (message.includes('ExpiredCodeException')) {
    return 'Code de vérification expiré. Demandez-en un nouveau.';
  }
  return message;
}

export default function Login({ onSignedIn }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Après une redirection SSO (Google), Cognito revient avec des paramètres
  // dans l'URL : code (succès) ou error / error_description (échec). On
  // affiche l'erreur éventuelle puis on nettoie l'URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get('error_description');
    if (errorDescription) {
      setError(decodeURIComponent(errorDescription));
    }
    if (
      params.get('code') ||
      params.get('error') ||
      params.get('error_description') ||
      params.get('state')
    ) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'signin') {
      setLoading(true);
      try {
        const result = await signIn({ username: email, password });
        const step = result.nextStep.signInStep;
        if (step === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
          setMode('totp');
        } else if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          setMode('newPassword');
        } else if (step === 'CONFIRM_SIGN_UP') {
          setMode('confirm');
        } else if (step === 'DONE') {
          onSignedIn();
        } else {
          setError(`Étape de connexion non gérée : ${step}`);
        }
      } catch (err) {
        setError(formatAuthError(err));
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
    } else if (mode === 'confirm') {
      // 'confirm' : valider le code reçu par email
      setLoading(true);
      try {
        await confirmSignUp({ username: email, confirmationCode: code });
        await signIn({ username: email, password });
        onSignedIn();
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setLoading(false);
      }
    } else if (mode === 'newPassword') {
      if (newPassword !== confirmNewPassword) {
        setError('Les deux mots de passe ne correspondent pas.');
        return;
      }
      if (newPassword.length < 8) {
        setError('Le mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      setLoading(true);
      try {
        await confirmSignIn({ challengeResponse: newPassword });
        onSignedIn();
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setLoading(false);
      }
    } else {
      // 'totp' : valider le code à 6 chiffres de l'app d'authentification
      setLoading(true);
      try {
        await confirmSignIn({ challengeResponse: code });
        onSignedIn();
      } catch (err) {
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    }
  }

  function handleGoogle() {
    setError('');
    signInWithRedirect({ provider: 'Google' }).catch((err) =>
      setError(err.message ?? String(err))
    );
  }

  return (
    <div className="auth-card">
      <h2>Serveur MCP - Connexion</h2>

      {mode === 'confirm' ? (
        <p className="info">
          Un code de vérification a été envoyé à <strong>{email}</strong>.
          Saisis-le ci-dessous.
        </p>
      ) : mode === 'totp' ? (
        <p className="info">
          Saisis le code à 6 chiffres généré par ton application
          d'authentification (TOTP).
        </p>
      ) : mode === 'newPassword' ? (
        <p className="info">
          Ce compte a été créé avec un mot de passe temporaire.
          Définis ton nouveau mot de passe ci-dessous.
        </p>
      ) : (
        <p className="info">
          Accès sécurisé par Amazon Cognito (email + mot de passe ou compte
          Google).
        </p>
      )}

      {(mode === 'signin' || mode === 'signup') && (
        <button type="button" className="google-btn" onClick={handleGoogle}>
          Continuer avec Google
        </button>
      )}

      {(mode === 'signin' || mode === 'signup') && (
        <div className="auth-divider">ou</div>
      )}

      <form onSubmit={handleSubmit}>
        {mode !== 'confirm' && mode !== 'totp' && (
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

        {mode === 'newPassword' && (
          <>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </label>
          </>
        )}

        {(mode === 'confirm' || mode === 'totp') && (
          <label>
            Code de vérification
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
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
            : mode === 'confirm'
            ? 'Valider le code'
            : mode === 'newPassword'
            ? 'Définir le mot de passe'
            : 'Valider le code TOTP'}
        </button>
      </form>

      <div className="auth-switch">
        {mode === 'signin' ? (
          <>
            <p>Pas encore de compte ?</p>
            <button className="link" onClick={() => { setMode('signup'); setError(''); }}>
              S'inscrire
            </button>
          </>
        ) : mode === 'signup' ? (
          <>
            <p>Déjà un compte ?</p>
            <button className="link" onClick={() => { setMode('signin'); setError(''); }}>
              Se connecter
            </button>
          </>
        ) : mode === 'totp' ? (
          <button className="link" onClick={() => { setMode('signin'); setError(''); }}>
            Revenir à la connexion
          </button>
        ) : mode === 'newPassword' ? (
          <button className="link" onClick={() => { setMode('signin'); setError(''); setNewPassword(''); setConfirmNewPassword(''); }}>
            Revenir à la connexion
          </button>
        ) : (
          <>
            <p>Déjà un compte ?</p>
            <button className="link" onClick={() => { setMode('signin'); setError(''); }}>
              Se connecter
            </button>
            <button
              className="link"
              onClick={() =>
                resendSignUpCode({ username: email }).catch((err) =>
                  setError(err.message)
                )
              }
            >
              Renvoyer le code
            </button>
          </>
        )}
      </div>
    </div>
  );
}