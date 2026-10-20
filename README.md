# Triathlon V2 — GitHub Pages

Carnet Garmin consultable à l'adresse **https://patfoort47-gif.github.io/Sport/** une fois GitHub Pages activé et le workflow de déploiement réussi.

La V2 importe les FIT avec **fit-file-parser**, affiche les parcours avec **Leaflet + OpenStreetMap** et les courbes synchronisées avec **Chart.js**. L'interface responsive utilise **Tailwind CSS via CDN** (version figée avec contrôle d'intégrité), en complément des styles locaux. React/TypeScript est compilé en JavaScript statique. [Cahier des charges V2](docs/cahier-des-charges-v2.md). En mode local, les données restent dans IndexedDB. Après connexion, **Supabase Auth, Database et Storage** conservent vos activités et FIT pour vos différents appareils. Une récupération Garmin personnelle peut être activée via GitHub Actions.

**Pour le partage entre appareils et la récupération automatique : [guide Supabase + Garmin](docs/supabase-garmin.md).** L’import manuel V2 fonctionne sans cette configuration. La clé publique du projet est intégrée ; il reste à exécuter le SQL, créer votre compte et configurer la première session Garmin. Aucun mot de passe Garmin ni clé serveur n'est inclus dans le site.

## Activer GitHub Pages (une seule fois)

1. Ouvrir [Settings → Pages](https://github.com/Patfoort47-gif/Sport/settings/pages) du dépôt.
2. Dans **Build and deployment → Source**, sélectionner **GitHub Actions**.
3. Ouvrir [Actions → Test and deploy GitHub Pages](https://github.com/Patfoort47-gif/Sport/actions/workflows/pages.yml). Si le dernier déploiement a échoué avant l'activation de Pages, utiliser **Re-run all jobs**, ou **Run workflow** sur `main`.
4. Attendre que les tâches `build` et `deploy` soient vertes, puis ouvrir https://patfoort47-gif.github.io/Sport/.

Chaque push sur `main` relance automatiquement les tests unitaires, les tests SQL des règles d’accès, la compilation TypeScript, les tests Python et les tests Chromium, puis déploie seulement si tous réussissent. La configuration Vite utilise `/Sport/` pour les ressources du site.

## Connecter Garmin depuis le site

Le formulaire Garmin et le code MFA sont disponibles après activation du petit service HTTPS fourni dans `render.yaml`. **[Guide sans script sur vos appareils](docs/garmin-web.md)**. GitHub Pages reste l'adresse de l'application ; Render traite uniquement la connexion et la demande de synchronisation. Le déploiement externe et la migration supplémentaire sont à activer une seule fois.

## Utiliser l'application

- Cliquer sur **Importer des fichiers FIT**, ou déposer un ou plusieurs fichiers dans la zone d’import, qui reste toujours disponible.
- Filtrer par discipline et dates ; cliquer sur une activité pour ses graphiques, sessions, transitions, tours, fond OpenStreetMap et tracé GPS.
- Se connecter au même compte sur PC et téléphone pour accéder aux activités Supabase. Les anciennes activités locales se transfèrent avec le bouton dédié après connexion.
- En mode local, réouvrir le site dans le même navigateur et le même profil pour retrouver ses activités.

**Garder une copie de ses FIT.** Effacer les données du navigateur, utiliser une navigation privée ou changer d'appareil peut faire disparaître l'accès aux activités locales. Le mode local reste propre à chaque navigateur ; le mode connecté partage les activités via Supabase. Les FIT ne sont jamais ajoutés au dépôt GitHub. Les anciens imports de l'API SQLite ne sont pas migrés automatiquement : réimporter leurs FIT dans cette version.

La carte affiche le parcours GPS sur les tuiles OpenStreetMap avec attribution et cadrage automatique. Les courbes de fréquence cardiaque, allure et altitude partagent le curseur et la plage temporelle. Les champs absents restent absents. Le fond de carte nécessite Internet ; les requêtes de tuiles indiquent à OpenStreetMap la zone consultée, sans envoyer les fichiers FIT. Le chargement initial du site nécessite Internet ; aucun mode hors ligne avec service worker n'est encore implémenté.

## Développement

Node.js 24 recommandé ; aucun serveur Python à démarrer pour l'interface.

```bash
npm --prefix frontend ci
npm --prefix frontend run dev
```

Vite indique son adresse locale ; ouvrir le chemin `/Sport/`.

```bash
npm --prefix frontend test
npm --prefix frontend run build
# Installation du navigateur de test, une seule fois :
cd frontend
npx playwright install chromium
npm run test:e2e
```

Si Chromium est déjà installé, sélectionner son exécutable avec la variable `CHROMIUM_PATH` plutôt que de télécharger un second navigateur. `npm --prefix frontend run preview` sert le résultat de compilation pour les vérifications locales.

Les tests couvrent le décodage FIT, le stockage IndexedDB, la synchronisation serveur simulée, les règles SQL exécutées dans PostgreSQL/PGlite et les parcours Chromium local et multiappareil (Supabase simulé) sous `/Sport/`. Une validation avec des exports Garmin réels reste nécessaire.

## Backend Python historique (facultatif)

Le code FastAPI/SQLite est conservé pour une utilisation séparée de l'API. Il n'est pas utilisé par l'interface GitHub Pages et ses données ne sont pas partagées avec IndexedDB.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pytest -q
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Sous Windows : `.venv\Scripts\python.exe`. Le stockage de l'API est dans `~/.triathlon_app`, ou dans `TRIATHLON_DATA_DIR`. L'API expose `/api/health`, `/api/activities` et `/api/import`. Elle n'est pas nécessaire à GitHub Pages.

## Périmètre actuel

Import multiple, limite de 32 Mo par fichier, contrôle CRC, dédoublonnage SHA-256, liste et filtres, totaux, sessions multisports, graphiques synchronisés avec zoom, tours, fond OpenStreetMap et tracé GPS. Les transitions proviennent du fichier ; aucune T1/T2 n'est inventée. La fréquence cardiaque globale est pondérée par la durée des sessions qui la contiennent. Les temps sont ceux du chronomètre FIT, pas nécessairement ceux de déplacement.

Restent à développer : emballage desktop, calendrier, tags, découpage manuel, surveillance de dossier, records, tendances de forme/VO2max, agrégations semaine/mois/année et parcours coloré selon les mesures. Le seuil de chargement de 0,5 seconde avec 10 000 points n'est pas garanti.

### Statistiques et historique complet

Le menu **Statistiques générales** affiche les heures, kilomètres et séances par mois ainsi que la répartition du temps par sport. Les filtres de discipline (dont **Autres activités**) et de dates s’appliquent au journal, aux totaux et à ces graphiques. La navigation reste disponible sur téléphone.

Dans **Connexion Garmin**, **Récupérer mon historique** importe automatiquement les lots jusqu’à la date choisie (2018 par défaut). Gardez l’onglet ouvert ; après une interruption, relancez sans doublons. Le service Render doit être mis à jour avec la nouvelle route `/garmin/history`. Voir [le guide Garmin](docs/garmin-web.md#récupérer-lhistorique-depuis-2018).

### Accueil et analyse de l’entraînement

L’application s’ouvre sur un écran de connexion dédié. Après connexion, la première page est **Statistiques générales** ; les réglages du compte et la synchronisation Garmin sont regroupés dans **Compte et Garmin**. Un accès local explicite reste disponible pour consulter des fichiers sans compte. La déconnexion ramène à l’accueil.

Le tableau de bord présente le volume hebdomadaire sur 12 semaines, un calendrier des jours entraînés, la répartition du temps par discipline et les tendances mensuelles. La fenêtre de 12 semaines est ancrée sur la dernière activité de la sélection ; les jours et semaines sans activité enregistrée valent zéro. La comparaison de volume porte sur les quatre dernières semaines calendaires affichées et les quatre précédentes : la dernière semaine peut être incomplète, et aucun pourcentage n’est calculé si la période de référence est vide. Ces données décrivent le volume enregistré, pas la charge physiologique ou la condition physique.

Les filtres par sport et dates, ainsi que les raccourcis 30 jours / 90 jours / 1 an, s’appliquent aux totaux et aux graphiques. **Mes activités** conserve le journal et l’analyse détaillée (GPS, courbes, tours).
