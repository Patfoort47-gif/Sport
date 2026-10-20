# V2 — Suivi et analyse Garmin / Triathlon

## Objectif

Un tableau de bord web accessible sur https://patfoort47-gif.github.io/Sport/ pour importer, consulter et analyser des séances de natation, cyclisme, course et multisport, directement sur PC, portable et téléphone.

## Parcours retenu

1. Importer un FIT ou un lot avec le sélecteur ou une zone de dépôt permanente, même si l'historique contient déjà des séances.
2. Décoder côté navigateur les sessions, tours, horodatages, coordonnées GPS et capteurs disponibles : fréquence cardiaque, vitesse, cadence, altitude, puissance et température. Vérifier le CRC et signaler les fichiers invalides individuellement.
3. Consulter un historique filtrable avec durée, distance, dénivelé et cardio moyen, plus les totaux de la sélection.
4. Ouvrir une activité pour sa trace Leaflet sur OpenStreetMap, centrée automatiquement avec `fitBounds`, et ses courbes Chart.js de cardio, allure et altitude selon le temps.
5. Parcourir les courbes avec un curseur synchronisé et sélectionner une même plage temporelle pour les graphiques. Les absences de capteur ou de GPS sont affichées comme telles, sans inventer de données.

## Bibliothèques et hébergement

| Partie | Solution |
| --- | --- |
| Hébergement web | GitHub Pages, chemin `/Sport/` |
| Parsing binaire dans le navigateur | `fit-file-parser` |
| Cartographie | Leaflet et tuiles publiques OpenStreetMap, avec attribution |
| Graphiques | Chart.js |
| Mise en page responsive | Tailwind CSS chargé par CDN, version figée et intégrité vérifiée ; styles locaux de base |
| Application existante | React/TypeScript compilé en JavaScript statique par Vite |
| Persistance locale | IndexedDB |
| Compte partagé facultatif | Supabase ; les activités existantes et les imports restent compatibles |

Les comptes Supabase et la connexion Garmin développés précédemment sont conservés. L'import manuel et l'analyse V2 restent utilisables sans activer le service Garmin. Le SDK Garmin est limité aux fixtures synthétiques des tests ; il n'est plus le parseur utilisé par l'application.

Le fond de carte nécessite Internet et suit la politique du serveur de tuiles OpenStreetMap : pas de téléchargement massif ou de préchargement. En cas d'indisponibilité des tuiles, la trace reste affichable. Les tuiles consultées indiquent au fournisseur la zone géographique de la carte. Les fichiers FIT ne sont pas envoyés à OpenStreetMap.

## Validation

Tests de décodage (unités, dates, CRC, transitions et capteurs manquants), calculs des séries temporelles, compilation TypeScript et parcours Chromium : import multiple, dépôt après un premier import, carte, graphiques, affichage mobile, stockage local et comptes partagés simulés. Les tuiles et le CDN sont servis localement dans les tests pour ne pas dépendre d'un réseau tiers.

La validation avec des exports Garmin réels reste distincte des fixtures synthétiques. La V2 ne promet pas une estimation de VO2max, des records personnels ni une cartographie hors ligne.
