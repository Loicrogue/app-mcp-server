import { useEffect, useState } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import './awsConfig';
import Login from './components/Login';
import Catalogue from './components/Catalogue';
import TestConsole from './components/TestConsole';
import Security from './components/Security';
import useTheme from './hooks/useTheme';
import './App.css';

function App() {
  const [theme, toggleTheme] = useTheme();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('catalogue');

  useEffect(() => {
    // Restaure la session si un utilisateur est déjà connecté.
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));

    // Réagit aux événements d'authentification Amplify (connexion/déconnexion).
    const removeListener = Hub.listen('auth', ({ payload }) => {
      if (
        payload.event === 'signedIn' ||
        payload.event === 'signInWithRedirect'
      ) {
        getCurrentUser().then(setUser).catch(() => setUser(null));
      } else if (payload.event === 'signedOut') {
        setUser(null);
      }
    });
    return removeListener;
  }, []);

  async function handleSignOut() {
    await signOut();
    setUser(null);
  }

  if (checking) {
    return <div className="app"><p>Chargement…</p></div>;
  }

  if (!user) {
    return (
      <div className="app">
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? '☀️' : '🌙'}
        </button>
        <Login onSignedIn={() => getCurrentUser().then(setUser).catch(() => setUser(null))} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Serveur MCP</span>
        <span className="muted">Connecté : {user.username}</span>
        <nav>
          <button
            className={tab === 'catalogue' ? 'active' : ''}
            onClick={() => setTab('catalogue')}
          >
            Catalogue
          </button>
          <button
            className={tab === 'console' ? 'active' : ''}
            onClick={() => setTab('console')}
          >
            Console de test
          </button>
          <button
            className={tab === 'security' ? 'active' : ''}
            onClick={() => setTab('security')}
          >
            Sécurité
          </button>
          <button className="link" onClick={handleSignOut}>
            Se déconnecter
          </button>
          <button onClick={toggleTheme}>
            {theme === 'light' ? '☀️' : '🌙'}
          </button>
        </nav>
      </header>

      <main>
        {tab === 'catalogue' && <Catalogue />}
        {tab === 'console' && <TestConsole />}
        {tab === 'security' && <Security username={user.username} />}
      </main>
    </div>
  );
}

export default App;