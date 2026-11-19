# KABA Fight

Appli personnelle de suivi du poids et de la nutrition pour préparer une compétition de boxe (pesée le 11/12/2026, catégorie 75 kg).

Prototype inspiré du projet KABA (Master e-marketing et management de l'innovation, IAE Montpellier) : l'utilisateur fixe un objectif personnel, l'appli propose et l'utilisateur décide.

## Ce que fait l'appli
- Pesée du matin, poids lissé et trajectoire jusqu'au jour de la pesée.
- Calories et macros du jour, avec des objectifs différents les jours de boxe et de repos.
- Ajout rapide des repas : base d'aliments courants, repas récents, saisie manuelle.
- Dépense réelle recalculée à partir des pesées et des repas notés, et proposition d'ajustement des objectifs.
- Mode « semaine du combat » à partir de J-4 (alimentation pauvre en fibres, checklist du jour J), d'après la position de l'ISSN (2025) sur les sports de combat.

## Comment c'est construit
- `index.html` : l'appli (PWA installable, fonctionne hors connexion). Généré par `python3 build.py` à partir de `src/`.
- `apps-script/Code.gs` : petit serveur Google Apps Script qui lit et écrit les données dans un Google Sheet privé. La clé d'accès n'est pas dans ce dépôt.
- Les données personnelles ne sont jamais stockées ici : elles restent dans le Google Sheet de l'utilisateur et en cache sur son téléphone.

Repères nutritionnels indicatifs, ce n'est pas un avis médical. Toute coupe de poids par déshydratation se décide avec un coach.
