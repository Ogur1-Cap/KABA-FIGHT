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
- 19/11 23h30 : audit d'affichage (Playwright, mobile 360/390/412, toutes les vues + feuille d'ajout) : les boutons modifier/supprimer des repas (white-space:nowrap dans .meal .k) débordaient → toute la page s'élargissait (écran décalé, nav et feuille trop larges). Fix : actions sur une ligne sous le repas (.meal .acts), nom flex:1 1 0 + min-width:0, filet de sécurité html,body overflow-x:hidden, en-tête « avant la pesée » sans retour à la ligne, menu Recettes « Auto » aligné. Script d'audit : /home/claude/qa/audit.py. Cache sw kaba-v5.
- 20/11 12h : (1) verdict de pesée instantané sous la pesée du jour (calc.js weighVerdict : écart, graisse expliquée par la veille, causes eau/glucides/boxe/repas tardif, trajectoire, conseils). (2) Départ réel = moyenne des 3 premières pesées (startPoint), utilisée par planWeight et trendSeries (le 77,5 du profil était faux). (3) proposal : déficit continu 0-750, mode 'maintien' si déficit < 100 (mange à sa dépense), léger surplus (-150) si tendance < fwTarget − 0,5. (4) autoAdjust() : applique seul les objectifs dès 4 pesées, écart ≥ 100 kcal, au plus tous les 3 jours, avant la semaine du combat (source 'auto maintien/perte' dans Ajustements). (5) Onglet Sheet « Claude » (Date, Heure, Message) créé ; Code.gs le renvoie (data.claude) ; carte « Le mot de Claude » en haut d'Aujourd'hui (note du jour ou de la veille). (6) Code.gs : clés mémorisées dans les Propriétés du script (cle_), coach maxOutputTokens 700 → 4000 (réponses coupées par la réflexion Gemini), ' […]' si MAX_TOKENS. Script à recoller par raph. sw kaba-v6.
- 20/11 13h50 : modifier un repas → bloc « Noté X g → mangé Y g » + raccourcis ¼ ½ ¾ ×1,5 ×2 : kcal et macros recalculés au prorata des valeurs d'origine, grammes écrits dans le nom « (Y g) ». Quantité notée lue dans le nom « (N g) », sinon 100. sw kaba-v7.
- 20/11 18h : regrouper des aliments en un plat. Poignée ⋮⋮ sur chaque repas (pointer events, cible détectée à la hauteur du doigt) : glisser un aliment sur un autre ouvre « Composer un plat » ; on peut y glisser d'autres aliments ou utiliser « + ajouter au plat ». Nom proposé localement par dishName() (base pâtes/riz/omelette… + garnitures reconnues, ex. « Pâtes au pesto et parmesan »), modifiable. Création = delMeal des aliments + addMeal du plat (sommes, heure la plus tôt, src appli). Composition gardée sur le téléphone (localStorage kaba.groups) → bouton « dégrouper ». Pas de Gemini (instantané, pas de quota). sw kaba-v8.
- 22/11 10h45 : jours passés. Flèches ‹ › autour du titre d'Aujourd'hui (7 jours max en arrière, S.view non mémorisé) + bandeau « Tu complètes hier… ». renderToday, typeBtn et la feuille d'ajout utilisent viewDay(). Formulaire « modifier » : champ « Mangé » (jour) pour déplacer un repas (delMeal + addMeal avec la nouvelle date). sw kaba-v9.
- 24/11 : coach — le 23/11 Gemini a compté une part de wrap à 440 kcal/24 g (valeur Jow par portion) au lieu de 293/16 et proposé un menu à ~1 990/1 700 kcal en le disant « nickel ». context() donne maintenant le reste du jour (kcal, protéines) et précise que les valeurs des recettes sont celles d'UNE part, à additionner sans recalcul ni dépassement. sw kaba-v10. (Claude, supervision)
- 24/11 21h45 : Journal — « erreur appli analyse : TypeError » à 09h12 (réussie 4 s plus tard, sans doute réseau), mais seul le nom de l'erreur était envoyé. report('analyse') envoie maintenant nom + message + 1re ligne de la pile, pour diagnostiquer la prochaine fois. sw kaba-v11. (Claude, supervision)
- 24/11 23h : BUG valeurs des recettes importées via un MENU Jow (21/11) : l'API de partage ne donne pas les valeurs nutritionnelles, Gemini les estimait à partir de quantités divisées par 2 (galette 350 kcal au lieu de 532, pizza bianca 420 vs ~680, mafé 510 vs ~650, grilled cheese 380 vs ~680). Corrections : Code.gs jowFacts() lit les valeurs PAR PORTION sur la fiche Jow sans IA (schema.org calories/proteinContent…, puis texte FR « Calories 532 kcal / Matières grasses / Glucides / Protéines », puis texte EN), appliqué à chaque recette d'un menu (fetch de sa fiche) et à l'import d'une recette seule ; source 'jow' ou 'estimation'. Colonne N « Valeurs » dans Recettes (Jow / estimées / corrigées), lue et écrite par le script (vsrc). Appli : alerte rouge sur une recette « estimées », bouton « Corriger » / « corriger les valeurs » (kcal, P, G, L par portion + portions) qui recalcule aussi les parts déjà notées (fixRecipeMeals : repas « Nom (k/N) » source recette). Sheet : galette corrigée à la main (532/35/50/21, ingrédients pour 1 portion), pizza/grilled cheese/mafé/wrap marquées « estimées ». Script à recoller. sw kaba-v10.
- 25/11 9h45 : import Jow fiable et répétable. (1) Script : menu → Gemini donne aussi "portions" du menu ; valeurs remplacées par celles de la fiche Jow (jowFacts, + motif « Énergie 532 kcal ») ; import d'une recette seule : si Gemini échoue mais la fiche est lisible, import quand même (nom = og:title). (2) Appli : plus d'ajout direct. Les recettes importées vont dans S.pending (localStorage kaba.pending, survit à une fermeture) → carte « Vérifier avant d'ajouter » (renderReview) : badge ✓ lues sur Jow / ⚠️ estimées, kcal-P-G-L par portion modifiables, portions Jow, parts, « 1 part = … » en direct + doubt() + parts conseillées, lien fiche Jow, case à cocher (décochée d'office pour une estimation tant qu'il n'a pas vérifié ou corrigé ; doublons déjà en cours décochés), « Ajouter les recettes cochées ». Doublons dans un même import ignorés. Script à recoller. sw kaba-v11.
- 25/11 21h50 : Journal — 2e erreur « Unexpected non-whitespace character after JSON » sur une analyse texte (aussi le 19/11) : Gemini ajoute parfois du texte après son JSON, raph devait relancer à la main. L'appli relance maintenant l'analyse une fois toute seule dans ce cas (erreur JSON/illisible, rapide). Correction durable possible côté Code.gs (extraction par accolades équilibrées) lors du prochain collage. Testé 390 px avec faux serveur. sw kaba-v12. (Claude, supervision)
- 28/11 12h : BUG tendance. current() corrigeait le retard de la moyenne avec la pente des moindres carrés sur 7 jours, plafonnée à ±0,2 kg/j et multipliée par 4 : une pesée « eau » à 76,5 (22/11) donnait −157 g/j → poids estimé 74,96 au lieu de ~75,5 → passage automatique en maintien (2 400/2 150) le 28/11. Correctif : pente de Theil-Sen (médiane des pentes par paires) sur 14 jours, plafonnée à ±30 g/j → estimé 75,47. Règle proposal : avant la semaine du combat, déficit plancher 250 kcal tant que tendance > targetMorning + 0,3 ; maintien seulement en dessous ; surplus −150 seulement si tendance < targetMorning − 0,3. Profil remis à 2 150/1 900 (ligne Ajustements « claude »). sw kaba-v12.
