import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

// Modèle de démonstration (base de données AppSync).
// Chaque nouvel enregistrement est autorisé ici en accès invité.
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.guest()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});