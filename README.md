# Triathlon local — GitHub Pages

Carnet Garmin consultable à l'adresse **https://patfoort47-gif.github.io/Sport/** une fois GitHub Pages activé et le workflow de déploiement réussi.

L'interface React/TypeScript décode les FIT dans le navigateur. En mode local, les données restent dans IndexedDB. Après connexion, **Supabase Auth, Database et Storage** conservent vos activités et FIT pour vos différents appareils. Une récupération Garmin personnelle peut être activée via GitHub Actions.

**Configuration nécessaire : [guide Supabase + Garmin](docs/supabase-garmin.md).** La clé publique du projet est intégrée ; il reste à exécuter le SQL, créer votre compte et configurer la première session Garmin. Aucun mot de passe Garmin ni clé serveur n'est inclus dans le site.

## Activer GitHub Pages (une seule fois)

1. Ouvrir [Settings → Pages](https://github.com/Patfoort47-gif/Sport/settings/pages) du dépôt.
2. Dans **Build and deployment → Source**, sélectionner **GitHub Actions**.
3. Ouvrir [Actions → Test and deploy GitHub Pages](https://github.com/Patfoort47-gif/Sport/actions/workflows/pages.yml). Si le dernier déploiement a échoué avant l'activation de Pages, utiliser **Re-run all jobs**, ou **Run workflow** sur `main`.
4. Attendre que les tâches `build` et `deploy` soient vertes, puis ouvrir https://patfoort47-gif.github.io/Sport/.

Chaque push sur `main` relance automatiquement les tests unitaires, les tests SQL des règles d’accès, la compilation TypeScript, les tests Python et les tests Chromium, puis déploie seulement si tous réussissent. La configuration Vite utilise `/Sport/` pour les ressources du site.

## Utiliser l'application

- Cliquer sur **Importer des fichiers FIT**, ou déposer des fichiers dans la zone vide.
- Filtrer par discipline et dates ; cliquer sur une activité pour ses graphiques, sessions, transitions, tours et tracé GPS.
- Se connecter au même compte sur PC et téléphone pour accéder aux activités Supabase. Les anciennes activités locales se transfèrent avec le bouton dédié après connexion.
- En mode local, réouvrir le site dans le même navigateur et le même profil pour retrouver ses activités.

**Garder une copie de ses FIT.** Effacer les données du navigateur, utiliser une navigation privée ou changer d'appareil peut faire disparaître l'accès aux activités locales. Le mode local reste propre à chaque navigateur ; le mode connecté partage les activités via Supabase. Les FIT ne sont jamais ajoutés au dépôt GitHub. Les anciens imports de l'API SQLite ne sont pas migrés automatiquement : réimporter leurs FIT dans cette version.

La carte trace le GPS sans fond cartographique et sans requête à un fournisseur de cartes. Le chargement initial du site nécessite Internet ; aucun mode hors ligne avec service worker n'est encore implémenté.

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

Import multiple, limite de 32 Mo par fichier, contrôle CRC, dédoublonnage SHA-256, liste et filtres, totaux, sessions multisports, graphiques synchronisés avec zoom, tours et tracé GPS. Les transitions proviennent du fichier ; aucune T1/T2 n'est inventée. La fréquence cardiaque globale est pondérée par la durée des sessions qui la contiennent. Les temps sont ceux du chronomètre FIT, pas nécessairement ceux de déplacement.

Restent à développer : emballage desktop, calendrier, tags, découpage manuel, surveillance de dossier, records, tendances de forme/VO2max, agrégations semaine/mois/année et parcours coloré selon les mesures. Le seuil de chargement de 0,5 seconde avec 10 000 points n'est pas garanti.
