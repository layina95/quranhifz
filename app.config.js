// L'identifiant du projet Expo n'est plus ecrit dans app.json : il etait celui du
// depot d'origine, et l'application y enregistrait les jetons de notification de
// ses propres utilisateurs. Il vient maintenant de la variable d'environnement
// EXPO_PUBLIC_EXPO_PROJECT_ID, posee au moment de la compilation.
//
// Sans cette variable, l'application se compile et fonctionne : elle refuse
// simplement de s'enregistrer pour les notifications, avec un message explicite
// (« Projet Expo manquant pour les notifications push. ») plutot que d'envoyer
// les jetons chez quelqu'un d'autre.
module.exports = ({config}) => {
  const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  return {
    ...config,
    android: {
      ...config.android,
      ...(process.env.GOOGLE_SERVICES_JSON_PATH
        ? {googleServicesFile: process.env.GOOGLE_SERVICES_JSON_PATH}
        : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? {eas: {...(config.extra?.eas ?? {}), projectId}} : {}),
    },
  };
};
