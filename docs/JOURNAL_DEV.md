# KABA Fight — journal de bord (pour reprendre le travail)

## Contexte
- Utilisateur : raph, 26 ans, 1,76 m, boxeur. 77,5 kg le 18/11/2026 → viser 74,5 kg le matin à jeun le 11/12/2026 (pesée l'après-midi, catégorie 75 kg ±0,25).
- Boxe mardi 20-22h et jeudi 20h30-22h. Travail assis.
- Appli inspirée de son projet de cours KABA (Google Doc « Projet Marketing projet », dossier Drive PROJET MARKETING) : objectif perso d'abord, « l'IA propose, l'utilisateur décide ».
- Ancien suivi : Claude Sheet https://claude.ai/artifact/D2h96mbiBmbirLwFsfmDXx (archive).

## Choix techniques
- Une seule page HTML (`/home/claude/kaba/index.html`) publiée en artifact.
- Capacités : db (données), user, sample {images:true} (photo + coach), dictation.
- Règle db : root read view / write owner (appli perso).
- Pas de localStorage pour l'état.

## Modèle de données (db de l'artifact)
- `kaba/profile` : profil + objectifs (startDate, startWeight, targetMorning, fwTarget, competitionDate, trainingDays, kcalTrain, kcalRest, protein, fat, tdee0, heightCm, age).
- `days/<YYYY-MM-DD>` : {date, weight?, type?('boxe'|'repos'), meals:[{id,at,name,kcal,p,c,f,src,items?}]}
- `ajustements/<id>` : {at, oldTrain, oldRest, train, rest, tdee, source, n}
- `chat/log` : {messages:[{role:'user'|'assistant', text, at}]} (30 derniers)

## Règles de calcul
- Tendance = moyenne mobile exponentielle (alpha 0,2) du poids du matin.
- Trajectoire : 77,5 (19/11) → 75,3 (7/12, début semaine du combat) → 74,5 (11/12).
- Dépense adaptative : sur les 14 derniers jours complets, apport moyen + (tendance début − tendance fin) × 7700 / nb jours ; mélangée avec la formule (2400) selon le nb de jours renseignés.
- Proposition : déficit = (tendance − 75,3) × 7700 / jours restants, borné 250-800 kcal ; moyenne ≥ 1 700 ; jour boxe = repos + 250.
- Macros : prot 155 g, lipides 55 g, glucides = le reste.
- Semaine du combat : à partir du 7/12 ; pauvre en fibres (<10 g/j) du 8 au 11/12 (ISSN 2025) ; pas de déshydratation sans coach.

## Avancement
(voir plus bas, mis à jour à chaque étape)

### 19/11/2026 ~00:30 — V1 publiée
- Artifact « KABA Fight » : slug 68034514-bc21-4290-9f97-9efb5ef104a9, https://claude.ai/artifact/Dqx1wfGbfMeD41yQ1pYSjS
- Capacités déclarées : db (root read view / write owner), user, sample {images:true}, dictation.
- Profil écrit dans `kaba/profile` (version 1).
- Onglets : Aujourd'hui (anneau kcal, macros, pesée, repas), Courbe (graphique + historique), Coach (bilan/ajustement + chat), Réglages.
- Ajout repas : Photo (sample.json + image réduite 1024px), Voix/texte (dictation), Manuel. Grammages modifiables avant enregistrement.
- Poids lissé = tendance EMA 0,2 corrigée du retard par la pente des 7 derniers jours. TDEE = apport moyen − pente régression × 7700, mélangé à 2400 selon nb de jours notés (≥4 jours requis, sinon pas de proposition).
- Proposition : déficit borné 250-750, moyenne ≥ 1 750, boxe = repos + 250.
- Tests : calc_test.js (node), shot.py + mock.js (playwright, captures mobile clair/sombre, semaine du combat). Tout OK.

## Idées V2 (pas encore fait)
- Menus de la semaine + liste de courses pour Jow / drive (connecteur Carrefour existe, pas Jow/Intermarché).
- Scan code-barres Open Food Facts (fetch bloqué dans la page → passer par Claude).
- Repas favoris / « refaire ce repas » en 1 tap.
- Rappel de pesée (tâche planifiée).
- Export pour la soutenance KABA (retour d'expérience H3/H4/H6).

## Comment reprendre
- Modifier `/home/claude/kaba/index.html` puis republier avec publish_files (slug ci-dessus, base_version = dernière version, mode patch).
- Lire les données : db_get / db_list sur le slug (`days`, `kaba/profile`, `ajustements`, `chat/log`).
- Si le dossier de travail a disparu : lire la page avec list_files/read_file sur le slug.

### 19/11/2026 ~10h — Passage en vraie appli (PWA)
- Android, option A (photos analysées dans Claude, pas de clé API).
- Dépôt GitHub : Ogur1-Cap/kaba-fight (public), clone /home/claude/kaba-fight. Build : `python3 build.py` (src/template.html + src/style.css.html + src/calc.js + src/app.js → index.html).
- Google Sheet « KABA Fight – Données » : id 1Z622O-Fp1jVtgqGeXZvo4An_A-N7g5u77gFpidYIqpM. Onglets Profil (clé/valeur), Jours (Date, Poids, Type), Repas (ID, Date, Heure, Repas, Kcal, Prot, Gluc, Lip, Source), Ajustements.
- Backend : apps-script/Code.gs (TOKEN = A_REMPLACER dans le dépôt). Version avec la vraie clé : /home/claude/kaba/out/Code_KABA_Fight.gs, clé dans /home/claude/kaba/token.txt. NE PAS committer la clé.
- Connexion de l'appli : code = base64(JSON {u: URL du déploiement Apps Script, t: TOKEN}), à coller dans Réglages ou lien https://ogur1-cap.github.io/kaba-fight/#connect=CODE
- GitHub Pages : impossible à activer via l'API (proxy) → raph doit l'activer (Settings > Pages > main / root).
- Pour ajouter un repas pour lui depuis Claude : ajouter une ligne dans l'onglet Repas (ID unique m+timestamp, date en texte 'AAAA-MM-JJ, source "claude"). Poids : onglet Jours.
- L'ancien artifact KABA Fight (db) n'est plus la source de vérité.
- Testé : pwa_test.py (playwright + faux backend) → connexion, sync, ajout repas OK.
- URL Apps Script : https://script.google.com/macros/s/AKfycbzSKKL2OCo2nUexvCbdhJAsqE7_vLhE0uejxMUojJ39haQ9JPoFsuBpI5-gC2m65xWz7Q/exec (19/11 9h52 : renvoyait 'doGet not found' → code pas enregistré avant déploiement ; Pages pas encore en ligne). Lien de connexion dans connect_link.txt
- 9h56 : nouvelle URL Apps Script https://script.google.com/macros/s/AKfycbw3jH78_DJq225pCLToJQ6lipAs4ZUtLhcOZeiJoYo_tFVezntzYyBclA5oW8WEZ9Yw3g/exec (renvoie client_error à WebFetch → accès probablement pas 'Tout le monde')
- Site en ligne à https://ogur1-cap.github.io/KABA-FIGHT/ (majuscules, le nom du dépôt est KABA-FIGHT)
- 10h05 : raph confirme la synchro sur son téléphone. Reste : installation PWA, mise à jour du skill profil-raph (nouvelle archi).
- 10h15 : thème noir/jaune or (#f5c518), rouge #e5484d, argent #b8bec9 ; icônes refaites ; sw cache kaba-v2
- 10h30 : analyse photo via Gemini (gratuit) dans Code.gs (action analyze, GEMINI_KEY à coller par raph, fonction autoriser()). App : onglet Photo avec brouillon modifiable. Testé avec faux backend.
- 11h15 : clé Gemini reçue (format AQ.…), insérée dans out/Code_KABA_Fight.gs (jamais dans le dépôt).
- 11h45 : recettes Jow (onglet Recettes auto-créé ; actions importRecipe/setRecipe/delRecipe ; share_target manifest), dictée Web Speech. Script à recoller par raph (out/Code_KABA_Fight.gs avec clés).
- 11h55 : PWA bien installée (WebAPK) par raph. Import multi-liens + parts auto = ceil(kcal×portions / repas cible), repas cible = 40 % de la moyenne hebdo des objectifs (~750 kcal). Si partage sans lien → l'appli affiche le texte reçu.
- 12h05 : liens de partage de menu Jow = https://app.jow.com/XXXX?action=menuSharing&sharingId=… ; script : fetchJow suit les redirections (HTTP, meta, JS) puis renvoie {links} (pages recettes trouvées) ou {recipes} (Gemini). App : file d'attente qui déplie les menus. Le script en ligne était encore l'ancien (pas d'onglet Recettes) → raph doit recoller + Nouvelle version.
- 12h31 : script à jour OK, mais app.jow.com/vY3w?action=menuSharing → HTTP 400 côté Apps Script. App affiche désormais le texte partagé en cas d'échec. En attente : texte complet du partage Jow + test d'une recette seule.
- 12h50 : API menu Jow = https://api.jow.fr/public/share/link/details?key=&userId=&sharingId= (paramètres du lien de partage). Script importMenu() l'appelle et passe le JSON à Gemini. Structure JSON inconnue (WebFetch bloqué) ; si 4xx, demander les en-têtes de requête à raph.
- 12h52 : API menu Jow OK (passée jusqu'à Gemini). Erreur gemini 503 (saturé) → l'appli réessaie 2 fois (15 s, 30 s). Code.gs du dépôt : sur 503 passe au modèle suivant (optionnel pour raph).
- 13h00 : supervision. Onglet Journal (auto) : Date, Action, Statut, Durée, Tokens, Détail. Plafond 80 appels Gemini/jour (PropertiesService gemini_AAAA-MM-JJ). App : doubt() = 4P+4C+9F vs kcal (>25 %) et valeurs extrêmes → ⚠️ ; erreurs JS → logError. Proposé : tâche planifiée de bilan.
- 13h10 : recettes = colonnes L Parts mangées, M Statut ('en cours'|'archivée'). App : sélecteur de jour (8 derniers jours) dans l'ajout de repas et sur chaque recette ; bouton « Déjà mangée, terminer » ; archivage auto à la dernière part ; section Recettes terminées. Script (journal + statut) envoyé en .txt, pas encore collé par raph.
- 13h12 : sous-onglets En cours / Terminées dans Recettes.
- 13h15 : bouton « Annuler la dernière part » (data-undo) : eaten−1 + supprime le repas recette le plus récent (correspondance par nom).
- 13h20 : deux boutons photo (camIn capture=environment / photoIn galerie).
- 13h25 : Journal a montré 'gemini 404' (13h16-17) : flash-latest saturé (503) puis gemini-2.5-flash retiré (404). Fix : 2 essais par modèle sur 503, liste des modèles via ListModels (cache 24 h). Saisie manuelle : mode « Pour 100 g » + quantité.
- 13h35 : analyses très lentes, aucune ligne Journal après 13h17 (requêtes non terminées ?). Ajout thinkingLevel 'low' (repli sans si 400), plafond 70 s côté script, 90 s côté appli.
- 13h45 : Journal : analyse ok en 232 s, une en échec après 360 s (timeout flash-latest), clé Gemini apparue dans le Journal → masquée (F5 corrigée + replace key=***). flash-lite en premier. Coach intégré : action 'chat' (systemInstruction + historique), onglet Coach du Sheet (questions/réponses) pour supervision. Chat stocké en localStorage.
- 13h50 : bouton « modifier » sur les repas (delMeal + addMeal même id, pas de changement de script). raph demande que Claude réponde au lieu de Gemini → options proposées (API payante / réponses Claude via tâche planifiée et onglet Questions / garder Gemini + supervision).
- 13h55 : raph garde Gemini + supervision Claude. Tâche planifiée quotidienne 21h43 (rapport de supervision, push) refusée faute d'approbation explicite → demander à raph. Script avec coach pas encore collé.
- 14h00 : tâche planifiée créée : trig_01F5VjNynjE3w5BQDm1YMGbH « Supervision KABA Fight », tous les jours 21h43 Europe/Paris, push, approbation auto. Accueil : rangée d'actions rapides (Ajouter un repas / Pesée) en haut.
- 14h05 : feuille de route enregistrée dans le dépôt (ROADMAP.md) : 1 plan semaine du combat, 2 recalage départ, 3 rappel pesée, 4 séances boxe, 5 eau, 6 ce qu'il me manque, 7 suggestions Jow, 8 export soutenance.
- 14h00 : Journal : coach 'gemini lent' 87 s, photo 13h50 bloquée > 5 min. Forum Google : blocages connus avec structured output + thinkingConfig. Script : plus de responseMimeType ni thinkingConfig, JSON extrait du texte. À recoller.
- 19/11 22h45 : séance exceptionnelle ven. 20/11 ajoutée dans l'onglet Jours (Type = boxe). Réglages : planning des 14 prochains jours (toucher un jour = setType boxe/repos ; contour pointillé = exception ; une séance habituelle peut être annulée).
- 19/11 23h15 : onglet Coach : carte « Parler à Claude » en haut (bouton « Copier mon point + ouvrir » = context() dans le presse-papiers puis ouvre la discussion Claude ; « Ouvrir Claude » ; lien modifiable, stocké en localStorage 'claudeUrl', par défaut https://claude.ai/code/session_01UEcwpY45cjoMyqvk3D7UUN). Cache sw kaba-v4. Pas de changement de script.
