import { defineAuth, secret } from '@aws-amplify/backend';

// Connexion email + mot de passe, complétée par :
// - SSO Google (externalProviders) : les clientId/clientSecret sont lus depuis
//   des secrets Amplify (obligatoire, jamais en clair dans le dépôt).
// - MFA OPTIONAL avec TOTP (app d'authentification type Google Authenticator).
// NB : l'API Amplify Gen 2 (defineAuth) ne propose plus de champ "username"
// distinct ; l'email sert ici d'identifiant de connexion.
export const auth = defineAuth({
  loginWith: {
    email: {},
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
      },
      callbackUrls: [
        'http://localhost:3000/',
        'https://main.dw5aonh4td8cy.amplifyapp.com/',
      ],
      logoutUrls: [
        'http://localhost:3000/',
        'https://main.dw5aonh4td8cy.amplifyapp.com/',
      ],
    },
  },
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
  },
})