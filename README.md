# Triathlon local

Première version locale du carnet Garmin : API Python/FastAPI, interface React/TypeScript et SQLite. Aucun compte Garmin ni service distant nécessaire à l'exécution. Le navigateur accède à un serveur lié à l'interface locale uniquement.

## Installation

Python 3.12+ et Node.js 22+ recommandés.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Sous Windows, remplacer `.venv/bin/python` par `.venv\Scripts\python.exe`. Après installation, le démarrage et l'utilisation ne nécessitent plus Internet. Ouvrir le navigateur sur le port local 8000. Pour développer l'interface, lancer également `npm --prefix frontend run dev` ; Vite relaie `/api` vers le backend.

Le stockage est dans `~/.triathlon_app` par défaut. `TRIATHLON_DATA_DIR` permet de sélectionner un autre dossier inscriptible. Arrêter le serveur avant de copier **tout ce dossier** sur un autre ordinateur : base SQLite et fichiers FIT originaux. Ne pas fusionner simultanément deux copies.

## Fonctions disponibles

- Import multiple et glisser-déposer FIT ; contrôle CRC, limite de 32 Mo/fichier et dédoublonnage SHA-256.
- Liste filtrable par discipline et dates, totaux du filtre.
- Détail : sessions multisports et transitions présentes dans le FIT, tours, graphiques synchronisés avec zoom, tracé GPS hors ligne sans fond de carte.
- Conservation des sessions, tours et échantillons présents dans le FIT ; champs absents conservés comme absents.

Les temps affichés sont ceux du chronomètre FIT ; ils ne représentent pas nécessairement le temps de déplacement. Les transitions sont affichées telles que définies par le fichier : aucune T1/T2 n'est inventée. La fréquence cardiaque globale est pondérée par la durée des sessions qui en contiennent.

## Validation et limites

```bash
.venv/bin/python -m pytest -q
npm --prefix frontend run build
```

Les tests utilisent de petits FIT binaires synthétiques avec CRC valide, couvrant course, vélo, triathlon, doublons et corruption. Ils ne remplacent pas une validation avec vos exports Garmin réels.

Cette première version n'inclut pas encore : paquet desktop Tauri/Electron, calendrier, tags, découpage manuel, surveillance de dossier, records personnels, tendances de forme/VO2max, agrégations semaine/mois/année, couleur du parcours selon les mesures, fond cartographique. Les flux sont actuellement stockés en JSON dans SQLite ; le seuil de 0,5 seconde avec 10 000 points n'est pas garanti. Ces éléments du cahier des charges restent à développer et valider. Aucun calcul de charge ou de VO2max n'est estimé sans modèle défini.
