# Apprendre le Coran

Application Expo, React Native et TypeScript pour mémoriser le Coran en Hafs ‘an ‘Âsim. L’interface est en français. Le texte et les 604 pages du mushaf sont disponibles hors ligne.

L’icône de l’application provient de l’image fournie par le propriétaire du projet et se trouve dans `assets/icon.png`.

## État de la version

- Questionnaire initial : cases à cocher pour les sourates, juz’ et hizb connus par cœur, avec saisie des passages partiels. Les objectifs sont présentés des dix dernières sourates jusqu’au Coran entier, puis l’objectif personnalisé.
- Trois niveaux de rythme : Débutant (1 à 5 versets par séance), Intermédiaire (une demi-page) et Intensif (1 page, 2 pages ou 1 rub‘). Une séance quotidienne est possible en sélectionnant les sept jours.
- Programme durable dans SQLite : passages connus exclus, historique conservé lors des recalculs, report des séances. Pour l’objectif « Tout le Coran », choix entre commencer par Al-Fatiha ou par An-Nâs, puis parcourir les sourates précédentes en gardant les versets de chaque sourate dans leur ordre.
- Lecteur page par page du mushaf Hafs 1405, avec glissement horizontal dans les deux sens, repères visuels des versets de la séance et mode récitation masqué.
- Lecteur audio flottant à trois positions, sélection des versets et de la page, répétitions du passage ou de chaque verset, et réglages secondaires repliés. La récitation reste active quand le panneau est réduit ou masqué.
- Lecture simplifiée Hafs avec règles de Tajweed en couleur, traduction française du sens des versets, accès rapide FR / عربي, plein écran et appui long sur les zones de versets identifiées. Le changement d'affichage conserve le verset, la page et l'audio. Le mode texte auparavant nommé « Tajweed » conserve son identifiant de préférence pour éviter toute perte de réglage.
- Coran Tajweed : la page du Moushaf dessinée par la police couleur QCF V4, règles de Tajweed en couleur et versets à leur emplacement imprimé, avec suivi du verset récité pendant l'audio. Demande une connexion, et se retire d'un seul réglage : voir [docs/retirer-coran-tajweed.md](docs/retirer-coran-tajweed.md).
- Les objectifs entièrement connus ne sont plus proposés à l'inscription. Les choix multiples montrent des cases carrées roses. La date estimée de fin de l'objectif affiche le jour, le mois et l'année.
- Espace « Mes révisions » : révisions prioritaires, récentes et habituelles, cycles de 7, 14, 21 ou 30 jours, consolidation des nouveaux versets sur trois jours puis transfert au quatrième jour civil. Un juz’ entier est réparti en véritables rub‘ et nisf quand ces unités sont entièrement connues. Les séances manquées restent dues et le rattrapage est plafonné. Les auto-évaluations et marqueurs de difficulté sont enregistrés par verset.
- L’interrupteur **Profil → Apprentissage → Activer l’espace Révisions** est activé par défaut. Il masque immédiatement les cartes, statistiques, marqueurs et rappels de révision lorsqu’il est désactivé, sans supprimer les connaissances ni l’historique. Les récitations vocales restent accessibles.
- L’enregistrement de la voix utilise le microphone du téléphone, sauvegarde le fichier dans le stockage local durable, puis le synchronise automatiquement et de façon idempotente dans un bucket Supabase privé. Les fichiers hors ligne restent en attente. L’administration existante peut écouter, sélectionner les versets à retravailler et publier des commentaires écrits ou vocaux. L’élève retrouve ses corrections dans **Mes récitations**. La première utilisation explique le partage avec l’administrateur.
- Rappels locaux hebdomadaires à 19 h les jours d’apprentissage choisis, avec le hadith cité dans l’application. Réglages indépendants pour les rappels et les messages privés.
- Notifications push des nouveaux messages privés déclenchées dans Supabase, avec ouverture de la conversation et suppression de l’alerte lorsque celle-ci est déjà ouverte au premier plan.
- Quatre thèmes sauvegardés : Vert Émeraude, Rose Poudré, Lilas & Perle et Bleu Nuit & Or. L’accueil reprend un bandeau illustré, une carte de reprise de lecture, quatre raccourcis, les objectifs et les dernières lectures, tout en conservant le programme et les statistiques.
- La navigation principale est placée en haut : Accueil, Coran, Programme, Progrès, Amis. Les icônes du bandeau ouvrent séparément le Profil et les Réglages. Le Profil présente, dans cet ordre, le prénom, les récitations, les connaissances, l’objectif et le rythme, l’apprentissage, puis les préférences de partage avec les amis. Les Réglages regroupent l’apparence, l’affichage du Coran, les notifications, les réinitialisations et les sources.
- Programme distingue l’apprentissage des nouvelles plages et la révision des passages déjà mémorisés. Dans une séance du jour, l’enregistrement personnel précède le bouton d’écoute du récitateur. Le choix direct du récitateur dans le lecteur propose Al-Husary, Alafasy et Al-Minshawi.
- Statistiques calculées avec un poids commun fondé sur les lettres des versets mémorisés ; une même plage n’est comptée qu’une fois.
- Compte et synchronisation Supabase facultatifs, avec règles d’accès par utilisateur.
- Espace amis avec code d’invitation, acceptation, suivi partagé, présence en ligne, messagerie libre, signalements, cercles privés, objectifs communs et rendez-vous de révision. Le compte administrateur dispose d’une file de signalements, peut consulter les messages récents, retirer un message et suspendre ou rétablir la messagerie d’un membre. Le rôle est contrôlé dans Supabase.
- La liste Amis ouvre directement les conversations et montre un aperçu ainsi que le nombre de messages non lus. Une récitation synchronisée peut être envoyée volontairement à un ami accepté. Le message contient le passage et un lecteur audio. Le fichier reste dans le bucket privé ; l’accès de l’ami dépend d’une conversation partagée et d’une relation toujours acceptée.
- Remise à zéro de l’apprentissage, des révisions et de l’historique depuis Réglages, avec synchronisation du nouvel état au compte connecté.
- 480 entrées de toumoun dans `src/data/toumoun.json` **sans limites de versets** : une source fiable vérifiant les limites en Hafs reste à établir. Le moteur accepte ce rythme uniquement si les 480 entrées sont sourcées, vérifiées et contiguës. Il est actuellement indisponible. Les rub‘, nisf, hizb et juz’ proviennent des métadonnées Hafs de Quran Meta.

## Sources coraniques

Le texte arabe vocalisé provient de Tanzil, version Uthmani Hafs, repris sans modification des versets depuis le miroir documenté `dotquran/corpus`. Voir `src/data/TANZIL-LICENSE.txt` et [Tanzil](https://tanzil.net/docs/Text_License). `src/data/verses.json` contient exactement 6 236 versets.

La Lecture simplifiée utilise la copie Tanzil 2017 et les annotations Tajweed Hafs [cpfair](https://github.com/cpfair/quran-tajweed), sous CC BY 4.0. Le mode **Coran Tajweed** dessine la page avec la police couleur QCF V4 de Quran Foundation, demandée page par page au serveur du projet ; aucune page n'est recopiée dans l'application. La traduction française du sens est celle de Rachid Maach, publiée par [QuranEnc](https://quranenc.com/fr/browse/french_rashid). Les textes, les sources et les précautions de mise à jour sont détaillés dans [READER_DATA_SOURCES.md](READER_DATA_SOURCES.md) et [TAJWEED_PAGE_SOURCE.md](TAJWEED_PAGE_SOURCE.md).

Les 604 images Hafs 1405 ont été extraites de l’IPA fournie par le propriétaire du projet. Le fichier `ayahinfo_1920.db` de cette IPA a servi à construire `bounds.json`, afin d’afficher les repères dans le lecteur. La table `src/data/pages.json` a été régénérée depuis le placement du Moushaf imprimé par `scripts/regenerer-pages.mjs` : elle associe chaque verset à sa page, elle forme un pavage exact des 604 pages — 6 236 versets, aucun trou, aucun recouvrement — et le script refuse d’écrire si ce pavage n’est pas exact. Le détail de la vérification est dans [TAJWEED_PAGE_SOURCE.md](TAJWEED_PAGE_SOURCE.md). Le code ne modifie pas les images du mushaf. Avant la publication publique du dépôt, confirmer que les droits invoqués couvrent bien la redistribution de ces 604 images, y compris les éléments du Complexe du roi Fahd. Le texte Tanzil reste soumis à sa propre licence.

Les limites des 30 juz’ et 240 rub‘ proviennent de [Quran Meta](https://github.com/quran-center/quran-meta), spécifiquement de son jeu Hafs. Les 60 hizb et 120 nisf sont des regroupements exacts de ces rub‘. Quran Meta fournit les toumoun pour Qaloun, sans équivalent direct Hafs ; aucun numéro de verset Qaloun n’a été transposé ici.

Une [présentation du Mushaf Afrique](https://cp.alukah.net/personal_pages/0/27321/%D9%85%D8%B5%D8%AD%D9%81-%D8%A5%D9%81%D8%B1%D9%8A%D9%82%D9%8A%D8%A7/) décrit un découpage en toumoun sur une édition Hafs. Elle signale trois limites situées au milieu des versets 2:196, 3:7 et 18:22. Ce découpage ne peut donc pas être représenté *exactement* par de simples plages de versets entiers. Pour activer le rythme, il faut une liste complète de 480 limites vérifiées et une décision éditoriale explicite pour ces trois passages ; une approximation ne sera pas présentée comme authentifiée.

## Développement local

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm start
```

Ouvrir l’application dans Expo Go sur iPhone ou Android pour une première inspection. Pour des binaires installables, les flux de `.github/workflows/` produisent un APK Android et un IPA iOS non signé, sans passer par EAS.

## Synchronisation privée

1. Créer **votre propre** projet Supabase. Le projet `npbwnvrqmajwqtnncuyv` appartient au dépôt d’origine : ne l’utilisez pas.
2. Dans **SQL Editor**, exécuter `supabase/schema.sql`. La table `user_state` est protégée par Row Level Security et chaque utilisateur ne peut accéder qu’à sa propre ligne.
3. Copier `.env.example` vers `.env`, puis renseigner l’URL du projet et la **clé publique publishable/anon**. Ne jamais utiliser la clé `service_role` dans l’application.
4. Pour les binaires compilés par GitHub Actions, ajouter ces mêmes valeurs aux **Variables** du dépôt — `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`, dans *Settings → Secrets and variables → Actions → Variables*. La sauvegarde locale fonctionne même sans Supabase.

Pour activer les amis et la modération, exécuter ensuite `supabase/social.sql` dans **SQL Editor**. Le script crée les tables et fonctions avec RLS. Il ne donne accès à aucun compte administrateur à lui seul. Dans un second passage du SQL Editor, attribuer le rôle avec :

```sql
insert into public.app_admins(user_id)
select id from auth.users where email = '<adresse du compte administrateur>'
on conflict (user_id) do nothing;
```

Pour les notifications des messages, exécuter ensuite `supabase/notifications.sql`. Cette migration ajoute seulement les préférences de notification et les jetons des appareils. Un déclencheur sur `friend_messages` envoie le push depuis Supabase, indépendamment du téléphone de l’expéditeur. Les rappels d’apprentissage sont programmés localement par le téléphone et ne dépendent pas du réseau.

Pour la version 0.3.0, exécuter ensuite `supabase/social-v2.sql`. Cette migration conserve les conversations, ajoute le suivi des messages non lus, le masquage d’un message pour soi, les préférences de notification et le temps réel. Le partage de progression et de passage actuel est désactivé pour les profils existants ; chaque membre peut le réactiver dans **Mes amis**. Les demandes d’amis et leur acceptation déclenchent un push serveur si le destinataire a autorisé les notifications. La publication d’une étape est une action volontaire dans une conversation privée.

La version 0.7.0 utilise `supabase/recitations.sql`, appliqué au projet Coran le 24 septembre 2026. Ce script ajoute trois tables avec RLS et le bucket privé `recitations`. Un membre connecté lit uniquement ses récitations et les corrections associées. Les comptes inscrits dans `app_admins` peuvent écouter et corriger celles des élèves. Les fichiers audio ne sont jamais publiés dans GitHub. Les anciennes données d’apprentissage restent dans `user_state` et les dates de mémorisation par verset y sont ajoutées sans supprimer les anciennes propriétés.

La version 0.9.0 ajoute `supabase/notification-corrections.sql`, appliqué au projet le 24 septembre 2026 : la validation atomique d’une correction déclenche un push unique par appareil, selon la préférence de l’élève. `supabase/recitation-sharing.sql`, appliqué le même jour, étend uniquement l’accès aux récitations envoyées dans une conversation privée avec un ami accepté et autorise le propriétaire à supprimer son enregistrement. Un lien audio signé déjà émis reste utilisable jusqu’à son expiration, au plus dix minutes dans l’application.

Le lecteur de séance diffuse les fichiers MP3 par verset d’[Al Quran Cloud](https://alquran.cloud/cdn) pour Al-Husary, Alafasy et Al-Minshawi. La synchronisation visuelle du moushaf utilise les coordonnées de `bounds.json`. Les fichiers restent hébergés par la source ; l’application ne les republie pas. Consulter les [conditions d’Al Quran Cloud](https://alquran.cloud/terms-and-conditions) avant tout ajout de téléchargement hors ligne ou de distribution audio. Les répétitions sont calculées sur la plage de versets Hafs de la séance.

Vérifier que cette requête a ajouté une ligne ; le compte doit déjà exister et avoir confirmé son adresse. Ne jamais ajouter son adresse ou un identifiant privé au script public. Les administrateurs peuvent consulter les messages et signalements de toutes les discussions, y compris privées ; seuls les administrateurs désignés dans `app_admins` ont ce droit. Une suspension bloque l’envoi de nouveaux messages, tout en laissant l’apprentissage disponible. Les messages supprimés gardent un marqueur et le signalement conserve l’extrait original pour le suivi de modération.

L’URL de site Supabase et l’URL autorisée de redirection sont `coranmemoire://auth`. Les nouveaux courriels de confirmation et de récupération doivent être ouverts sur un téléphone où l’application est installée. Un ancien courriel avec `localhost:3000` ne peut pas être modifié : utiliser **Renvoyer le courriel de confirmation** dans Profil. Les données locales sont isolées par identifiant de compte ; un nouveau compte repart de zéro.

Pour l’IPA compilée par GitHub, renseigner dans **Settings → Secrets and variables → Actions → Variables** les variables `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. Le workflow les transmet au bundler Expo. La clé doit être de type **publishable/anon**, jamais `service_role`.

Le modèle de synchronisation est « dernière modification gagnante » lors de la connexion ou des modifications. Une modification simultanée sur deux téléphones peut écraser l’autre ; une résolution fine des conflits reste à ajouter.

## APK et IPA

Le workflow **Actions → IPA iPhone non signé → Run workflow** compile l’application sur un runner macOS GitHub, désactive la signature Xcode et met `coran-memoire-unsigned.ipa` dans les artefacts du run. Il ne demande ni compte Expo ni certificat Apple pour *compiler*. Cette IPA devra ensuite être signée dans eSign avec un certificat et un profil compatibles avec l’identifiant `fr.quranhifz.app` avant installation. Le [run 0.2.0 GitHub](https://github.com/Msoumaya2019/coran-memoire/actions/runs/35869746017) a réussi ; son archive ne contient ni signature Apple ni profil de provisionnement.

Le workflow **Actions → APK Android autonome → Run workflow** compile aussi un APK installable depuis GitHub, signé avec la clé Android de développement générée par Expo. Depuis la version 0.9.1, le workflow vérifie explicitement que le secret Firebase correspond à `fr.quranhifz.app` et que le fichier est présent dans le projet natif avant la compilation. Pour une distribution durable et les mises à jour, utiliser une clé de publication stable via EAS.

### Notifications push : configuration native

- L’identifiant du projet Expo **n’est plus écrit dans le dépôt** : il vient de la variable d’environnement `EXPO_PUBLIC_EXPO_PROJECT_ID`, alimentée par la variable GitHub `EXPO_PROJECT_ID`. Tant qu’elle est absente, l’application se compile et fonctionne, mais refuse de s’enregistrer pour les notifications, avec le message « Projet Expo manquant pour les notifications push. » — au lieu d’enregistrer les jetons de vos utilisateurs dans le projet d’un tiers. Créer **votre** projet Expo et renseigner cette variable avant d’activer les notifications.
- Pour Android, l’application Firebase `fr.quranhifz.app` se trouve dans le projet Firebase `coran-memoire`. Le workflow APK lit `FIREBASE_GOOGLE_SERVICES_JSON_BASE64` depuis les secrets GitHub, le décode dans le runner et le relie à la configuration Expo par `app.config.js`. Le fichier local `google-services.json` est ignoré par Git.
- La clé de compte de service Firebase FCM V1 a été enregistrée dans les **credentials Android** du projet Expo. Elle et la clé de signature Android se trouvent dans les identifiants privés d’Expo. Une sauvegarde locale est conservée hors du dépôt public.
- Sur iPhone, l’IPA est compilée sans signature. Pour recevoir des push distants après signature dans eSign, le certificat et le profil Apple doivent être valides pour `fr.quranhifz.app`, inclure la capacité Push Notifications et produire un droit `aps-environment` cohérent. Une clé APNs doit être configurée dans les credentials iOS d’Expo. Le 24 septembre 2026, les réponses du service Expo indiquaient explicitement `Could not find APNs credentials for fr.quranhifz.app` ; les push iOS ne peuvent donc pas encore parvenir aux appareils.
- Vérifier sur de vrais appareils : application ouverte, arrière-plan et fermée ; ouverture de la conversation ; rappel à 19 h un jour choisi, absence un autre jour, changement des jours et bascule des deux interrupteurs. Vérifier aussi le changement d’heure été/hiver dans le fuseau local. Dans **Réglages → Notifications**, le bouton de test programme un rappel local après cinq secondes, et les autres boutons affichent le nombre de rappels programmés ou vérifient l’enregistrement du jeton push.

Le workflow **Actions → Vérifier et compiler → Run workflow** construit l’APK Android avec Expo EAS Build. Préparation du propriétaire du compte :

1. Se connecter à Expo (`eas login`), puis relier le projet avec `eas init`. Cela ajoute l’identifiant EAS à `app.json`.
2. Dans Expo, créer un jeton personnel et l’ajouter comme secret GitHub `EXPO_TOKEN` dans **Settings → Secrets and variables → Actions**.
3. Lancer une première compilation Android interactive (`eas build -p android --profile preview`) pour enregistrer la signature chez EAS.
4. Lancer ensuite le workflow Android. Aucun envoi aux stores n’est configuré.

Ne mettre aucun certificat, mot de passe ou profil privé dans GitHub.

## Vérifications effectuées

Le contrôle TypeScript et les tests automatisés passent, dont l’isolation des comptes, les rappels à 19 h, la configuration Firebase du build Android, les répétitions audio L’export Metro iOS et Android de la version 0.9.0 a réussi. Les parcours du partage vocal, les notifications distantes et la présentation sur téléphones réels restent à vérifier avec deux comptes et des appareils iOS et Android. La configuration APNs du projet Expo n’est pas encore disponible ; une IPA non signée ne suffit pas à valider les push iOS.
