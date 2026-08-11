import { defineAuth } from '@aws-amplify/backend';

// Niveau minimum de connexion Cognito : email + mot de passe, sans OTP/MFA/SSO.
// NB : l'API Amplify Gen 2 (defineAuth) ne propose plus de champ "username"
// distinct ; l'email sert ici d'identifiant de connexion.
// SSO (Google/GitHub) via externalProviders : étape ultérieure (cf. GUIDE.md).
export const auth = defineAuth({
  loginWith: {
    email: {},
  },
})