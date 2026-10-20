# Activer le compte partagé et Garmin

Projet : `https://uelygvkvdlxrewpftyrf.supabase.co`.
La clé publique fournie est déjà configurée dans le site. Elle ne permet pas d'administrer le projet. **Le code préparé ne signifie pas que le SQL a été exécuté ou que Garmin est connecté.**

## 1. Préparer Supabase

Dans le tableau de bord de votre projet :

1. Ouvrir **SQL Editor → New query**.
2. Copier **tout** le fichier [202610200001_sport_cloud.sql](../supabase/migrations/202610200001_sport_cloud.sql) et exécuter **Run**. La migration est additive et peut être réexécutée. Elle crée les tables `sport_*`, le bucket privé `sport-files`, les règles d'accès par compte et un schéma privé pour la session Garmin.
3. Dans **Authentication → URL Configuration**, définir **Site URL** et ajouter **Redirect URLs** : `https://patfoort47-gif.github.io/Sport/`. Garder les autres URL déjà nécessaires à vos autres applications.
4. Dans **Authentication → Providers → Email**, activer l'inscription par e-mail si elle est désactivée. Utiliser un mot de passe d'au moins 8 caractères (ou plus selon votre politique). Si la confirmation est activée, confirmer via l'e-mail avant de se connecter. Le service e-mail Supabase peut avoir des limites d'envoi ; configurer SMTP si nécessaire.
5. Ouvrir le site, cliquer sur **Créer mon compte**, confirmer l'e-mail, puis se connecter. Utiliser **le même compte de l'application** sur PC et téléphone. Ce n'est pas votre mot de passe Garmin.
6. Si vous aviez déjà importé des FIT en mode local, cliquer sur **Transférer mes activités locales vers mon compte** depuis l'ancien navigateur. Le transfert conserve les originaux locaux et peut être relancé sans doublon.

Les imports après connexion vont dans Supabase. La déconnexion retrouve le mode local, sans afficher les données du compte précédent. Les listes sont actualisées toutes les minutes ; le bouton **Actualiser mes activités** recharge également l'état de la synchronisation.

La clé publique peut être remplacée à la compilation par la variable GitHub Actions `SUPABASE_PUBLISHABLE_KEY` si vous la faites tourner ultérieurement. Ne jamais mettre une clé `service_role` ou `secret` dans le frontend, une variable `VITE_*` ou un commit.

## Connexion Garmin recommandée : directement dans l'application

Suivre **[le guide de connexion depuis le site](garmin-web.md)**. Il configure un service HTTPS, puis permet de saisir les identifiants et le code MFA dans l'interface. Aucun script Python sur vos appareils ni secret `GARMIN_SESSION` à générer avec cette méthode.

Les sections suivantes conservent la méthode manuelle historique comme alternative, et ne sont **pas nécessaires** si vous utilisez le formulaire du site.

## 2. Alternative historique : créer une session Garmin sur votre ordinateur

La solution choisie est la bibliothèque non officielle Python `garminconnect`, dans un workflow GitHub Actions personnel. Il n'y a pas de mot de passe Garmin saisi dans le site public. La première connexion se fait localement et accepte le code de double authentification si Garmin le demande.

Installer Python 3.12+, télécharger/cloner le dépôt, puis dans son dossier :

```bash
python -m venv .venv
# Windows :
.venv\Scripts\python.exe -m pip install -r requirements-sync.txt
.venv\Scripts\python.exe -m scripts.garmin_login
# macOS / Linux :
.venv/bin/python -m pip install -r requirements-sync.txt
.venv/bin/python -m scripts.garmin_login
```

Choisir les deux commandes correspondant à votre système. Le script demande l'e-mail Garmin, le mot de passe masqué, puis éventuellement le code MFA. Il écrit la session dans **`.sport-garmin-session.json` dans votre dossier personnel**, sans afficher son contenu. Sur Windows, limiter l'accès au fichier à votre compte via les permissions du fichier ; sur macOS/Linux il est créé en mode 600. Ne pas partager, commiter ou publier ce fichier. Pour recommencer sans écraser un ancien fichier, utiliser `--output` avec un nouveau chemin.

## 3. Configurer GitHub Actions

Dans le dépôt **Settings → Secrets and variables → Actions** :

Créer les **Repository secrets** :

| Nom | Valeur à saisir uniquement dans GitHub Secrets |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur **legacy `service_role`** du projet Supabase, dans Settings → API Keys / Legacy API Keys. Jamais la clé publique, jamais dans le chat. |
| `GARMIN_SESSION` | Contenu du fichier privé généré à l'étape 2. Jamais dans le chat ni dans le dépôt. |

Créer les **Repository variables** :

| Nom | Valeur |
| --- | --- |
| `SUPABASE_USER_ID` | UUID de **votre compte de l'application**, dans Supabase → Authentication → Users. Choisir l'utilisateur qui vient de se connecter au site. |
| `GARMIN_SYNC_ENABLED` | `true` une fois les étapes précédentes terminées. |
| `GARMIN_MAX_ACTIVITIES` | Facultatif : `200` par défaut ; de `1` à `5000` activités récentes à vérifier par exécution. Augmenter pour récupérer un historique plus ancien. |

Puis ouvrir **Actions → Synchroniser Garmin → Run workflow**, laisser la case de réinitialisation décochée, lancer sur `main`, et attendre une exécution verte. Le site doit afficher la dernière synchronisation après actualisation. **C'est seulement après cette exécution réelle réussie que la récupération Garmin est confirmée.**

Le workflow s'exécute ensuite toutes les six heures, à la minute 17 en UTC ; GitHub peut retarder une exécution. La montre doit d'abord avoir envoyé ses activités à Garmin Connect. Le job est désactivé tant que `GARMIN_SYNC_ENABLED` n'est pas `true`. Sur un dépôt public inactif pendant 60 jours, GitHub peut désactiver les exécutions planifiées : les réactiver dans Actions. Les quotas GitHub/Supabase s'appliquent.

Le script n'utilise ni le profil public ni une URL FIT publique. Il télécharge les originaux depuis votre session Garmin, contrôle le CRC, importe toutes les parties FIT d'une archive et évite les doublons par SHA-256 et identifiant Garmin. Les entrées sans export FIT exploitable font échouer l'exécution et restent à examiner ; elles ne sont pas marquées comme importées.

L'exécution examine au maximum les `GARMIN_MAX_ACTIVITIES` activités les plus récentes : l'historique au-delà n'est pas récupéré. Un gros premier import peut dépasser les 45 minutes autorisées par ce workflow. Relancer reprend les activités non terminées dans la limite configurée ; les activités déjà importées ne sont pas téléchargées à nouveau. Les modifications/suppressions faites ensuite dans Garmin ne sont pas répercutées sur les imports existants.

## 4. Renouveler ou arrêter la connexion Garmin

Les sessions rafraîchies sont enregistrées dans le schéma SQL `sport_private`, sans accès pour les comptes du navigateur. Le secret GitHub sert au premier démarrage, puis de source explicite pour une reconnexion. **Ne pas ajouter `sport_private` aux schémas exposés par l'API Supabase.**

Si Garmin révoque la session, impose un nouveau MFA ou bloque la connexion : refaire l'étape 2, remplacer le secret `GARMIN_SESSION`, puis lancer le workflow en cochant **Utiliser une nouvelle session Garmin**. Cette bibliothèque est non officielle ; une évolution de Garmin peut nécessiter une mise à jour du code. Aucune disponibilité Garmin n'est garantie.

Pour arrêter : mettre `GARMIN_SYNC_ENABLED` à `false`. Pour supprimer aussi la session stockée, exécuter dans Supabase SQL Editor, avec l'UUID de votre utilisateur :

```sql
delete from sport_private.garmin_sessions
where owner_id = 'REMPLACER_PAR_VOTRE_UUID';
```

Puis supprimer le secret GitHub `GARMIN_SESSION` et le fichier local. Ne jamais copier une session, un mot de passe ou une clé serveur dans un ticket ou les logs. Les tests du dépôt vérifient les accès et les flux avec des services simulés ; ils ne constituent pas une connexion réelle à votre compte.
