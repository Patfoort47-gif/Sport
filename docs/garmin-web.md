# Connecter Garmin directement depuis l'application

Cette méthode remplace la création de session avec un script sur PC. Après l'activation initiale du service, les identifiants Garmin et le code MFA se saisissent **dans l'application GitHub Pages**, sur téléphone ou ordinateur. Ne pas utiliser le formulaire tant que l'URL configurée n'est pas celle de votre propre service HTTPS.

GitHub Pages héberge l'interface ; il ne peut pas exécuter le serveur de connexion Garmin. Le service Python est déployé sur Render depuis le même dépôt GitHub. Aucun Python à installer sur vos appareils. Ce service personnel accepte uniquement le compte Supabase dont l'UUID est configuré côté serveur.

## 1. Appliquer la nouvelle migration Supabase

Dans Supabase **SQL Editor**, exécuter [202610200002_garmin_leases.sql](../supabase/migrations/202610200002_garmin_leases.sql). La première migration `202610200001_sport_cloud.sql` doit déjà être appliquée.

La nouvelle migration empêche une connexion et une récupération périodique d'utiliser simultanément la session Garmin. Elle n'efface ni vos activités ni vos anciens imports.

## 2. Déployer le service depuis GitHub

Ouvrir **[Déployer le service sur Render](https://render.com/deploy?repo=https://github.com/Patfoort47-gif/Sport)**, se connecter à Render, sélectionner le dépôt si demandé, et examiner le Blueprint `render.yaml`. Il propose un service Web sur le plan gratuit. Si ce plan n'est plus disponible pour votre compte, vérifier les conditions affichées avant de choisir une offre payante.

Renseigner dans les variables privées du service Render :

| Variable | Valeur |
| --- | --- |
| `SUPABASE_USER_ID` | UUID de votre utilisateur de l'application, dans Supabase → Authentication → Users. Le même que celui configuré pour le workflow Garmin. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur legacy `service_role` de votre projet Supabase. La saisir uniquement dans Render, jamais dans GitHub Pages, un commit ou le chat. |

Le projet Supabase est déjà préconfiguré. Aucun mot de passe Garmin n'est à saisir dans Render.

Après déploiement, copier **l'URL HTTPS réellement attribuée** par Render, par exemple `https://sport-garmin-xxxx.onrender.com` (l'exemple n'est pas une adresse déjà déployée). La route `/health` doit renvoyer `{"status":"ok"}` ; cela vérifie le démarrage, pas encore la connexion Garmin ou les droits Supabase.

Le plan gratuit peut mettre le serveur en veille : la première connexion peut demander un temps de démarrage. Un redémarrage pendant une saisie MFA fait perdre la demande en cours ; attendre l'expiration du verrou (au maximum dix minutes pour la connexion), puis recommencer. Le serveur doit fonctionner avec **un seul worker et une seule instance**, comme le fichier fourni, car les demandes MFA durent cinq minutes en mémoire.

## 3. Relier le site à ce service

Dans GitHub → dépôt Sport → **Settings → Secrets and variables → Actions → Variables**, créer la **Repository variable** :

- Nom : `GARMIN_SERVICE_URL`
- Valeur : l'origine HTTPS réelle du service Render, sans `/health`, sans chemin et sans clé.

Ce n'est pas un secret : c'est l'adresse à laquelle le navigateur enverra les demandes Garmin. Le service n'accepte pas de demande sans session Supabase valide et refuse les autres comptes.

Dans **Actions → Test and deploy GitHub Pages**, relancer **Run workflow** sur `main` pour reconstruire et publier la configuration. Après réussite, recharger le site. En l'absence de cette URL, l'interface affiche le lien d'activation et ne propose pas de saisir le mot de passe Garmin.

## 4. Se connecter depuis l'application

1. Se connecter à votre compte de l'application.
2. Dans **Connexion Garmin**, saisir votre e-mail Garmin et votre mot de passe, puis **Connecter Garmin**.
3. Si Garmin demande une double authentification, saisir le code reçu dans **Code de vérification Garmin**. La demande expire après cinq minutes. Après trois échecs, recommencer la connexion ; un maximum de cinq tentatives est permis par période de dix minutes.
4. Une fois la session enregistrée, cliquer sur **Synchroniser maintenant** pour importer les 20 activités les plus récentes. Cette récupération se fait en arrière-plan ; la liste se recharge chaque minute et le bouton d'actualisation recharge aussi l'état de synchronisation. Le serveur doit rester actif jusqu'à sa fin.

Les identifiants transitent par HTTPS vers votre serveur, puis Garmin. Le formulaire efface le mot de passe à l'envoi ; le serveur ne le stocke pas en base, dans un fichier ou dans ses réponses. Seule la session Garmin est conservée dans `sport_private`, accessible uniquement aux fonctions serveur autorisées. Les corps de requêtes et les erreurs contenant les identifiants ne sont pas journalisés par ce service. Ne pas activer de capture des corps HTTP dans les outils de supervision du serveur.

## Récupération périodique sans garder le site ouvert

Conserver le workflow **Synchroniser Garmin** existant pour la récupération toutes les six heures. Configurer dans GitHub :

- Secret `SUPABASE_SERVICE_ROLE_KEY` : la clé serveur, uniquement dans GitHub Secrets.
- Variable `SUPABASE_USER_ID` : le même UUID que Render.
- Variable `GARMIN_SYNC_ENABLED` : `true`.
- Variable `GARMIN_MAX_ACTIVITIES` facultative : `200` par défaut, maximum `5000`.

**Le secret `GARMIN_SESSION` n'est plus nécessaire** : la connexion du formulaire enregistre directement la session dans Supabase. L'ancienne méthode reste compatible si vous l'utilisiez déjà ; ne cocher la réinitialisation depuis un ancien secret que si vous souhaitez explicitement le restaurer.

La bibliothèque Garmin est non officielle : une évolution de Garmin ou une restriction de connexion depuis l'hébergeur peut nécessiter une correction. Une session expirée se renouvelle via le même formulaire. Les tests du dépôt simulent Garmin et Supabase ; le déploiement du service et une connexion réelle restent nécessaires pour vérifier votre compte.
