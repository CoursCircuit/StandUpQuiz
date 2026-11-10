StandUp Quiz 2.2.1 — Sylvain Bovat
===============================

Une question. Une équipe. Tout le monde participe.
Langues, calcul mental, histoire, géographie, sciences…

INSTALLER

Mac Apple Silicon (M1 et suivants) :
  release/StandUp Quiz-2.2.1-arm64.dmg

Ouvrez le DMG et glissez StandUp Quiz dans Applications. Quittez l’ancienne
version avant d’ouvrir la nouvelle. Vos listes, réglages et parties précédentes sont repris.
Distribution locale avec signature ad hoc, sans Developer ID ni notarisation.
Les archives des versions précédentes sont conservées dans dist/ et release/.

Installez de préférence depuis le DMG dans Applications. Un dossier synchronisé
peut réajouter des métadonnées Finder à la copie de travail dans release/mac-arm64/.
La signature de l’app distribuée à l’intérieur du DMG a été vérifiée séparément,
en lecture seule.

PRÉPARER UNE LISTE

1. Créez une liste avec +, donnez-lui un nom et choisissez une branche.
2. Collez vos questions et leurs réponses, une paire par ligne :
     le chat ; die Katze
     7 × 8 ; 56
     Prise de la Bastille ; 1789
   Ce sont des exemples de formats : gardez un thème cohérent dans une liste.
3. Nommez les deux colonnes comme vous le souhaitez. Le sens est inversable.
4. Vérifiez l’aperçu, puis enregistrez la liste.

Les modèles proposent des exemples pour les langues, définitions, maths,
histoire, géographie et sciences. « Insérer un exemple » ouvre une nouvelle
liste ; le brouillon valide précédent est enregistré avant le changement.

Séparateurs acceptés : point-virgule, virgule, tabulation de tableur, flèche,
signe égal, barre verticale, tiret entouré d’espaces. Paires explicites en ligne :
  chat=Katze, chien=Hund, lapin=Kaninchen

Avec des virgules décimales, préférez le point-virgule :
  1,5 + 2 ; 3,5
Si une cellule contient le séparateur, entourez-la de guillemets :
  "bonjour, madame","Guten Tag, Frau"

Les doublons exacts et en-têtes reconnus sont ignorés ; les erreurs sont signalées
avant le jeu. Les questions identiques sont regroupées, leurs réponses réunies
avec « / ». Il faut au moins 3 questions et 3 réponses différentes. Les listes
courtes adaptent le nombre de propositions pour éviter les doublons. Une seule
équipe possède la bonne réponse, même avec six équipes et une petite liste.

Pour une projection lisible, privilégiez des réponses courtes. Avec des réponses
longues, choisissez deux propositions par équipe. Le texte s’adapte à la place
disponible ; le mode « Très grands caractères » reste facultatif.

DOSSIERS ET BIBLIOTHÈQUE

Le + à côté du filtre des dossiers crée un thème. La liste peut être rangée dans
le champ Dossier de l’éditeur, puis enregistrée, ou directement via son bouton ···.
Le bouton ··· du filtre permet de renommer ou supprimer le dossier sélectionné.
Supprimer un dossier conserve ses listes dans « Sans dossier ».

La recherche se fait dans le dossier sélectionné. « Tous les dossiers » rassemble
la bibliothèque. Les listes archivées restent accessibles et restaurables.
L’export .standup conserve dossiers, branches, colonnes et listes archivées.
L’import fusionne les dossiers de même nom et évite les doublons dans un même
dossier. Les identifiants en conflit sont protégés. TXT, CSV, TSV, JSON et .standup
sont acceptés, avec prise en charge des fichiers UTF-8 et UTF-16 de tableur.

PROMPT IA

Le bouton Prompt IA adapte la consigne à la branche, au thème, au niveau et aux
colonnes. Vous pouvez la modifier avant de la copier dans l’IA de votre choix.
Vérifiez les réponses produites, puis collez-les dans l’éditeur. Le jeu reste
entièrement utilisable sans compte IA, sans clé API et sans connexion.

JOUER

1. Choisissez le mode, 2 à 6 équipes, 2 à 5 réponses par équipe et le temps.
2. Dans Barème, définissez les points gagnés et les pénalités, de 0 à 100.
   Valeurs par défaut : +3 pour une réussite, −2 pour une erreur, −1 par faux départ.
   Erreur = la bonne équipe reste assise. Faux départ = une autre équipe se lève.
   Zéro permet de désactiver un gain ou une pénalité. Le barème est figé pour la partie.
3. Choisissez obligatoirement le nombre de questions, puis lancez la partie.
   La première manche démarre à votre signal.
4. L’équipe qui possède la réponse à la question projetée se lève ; les autres
   restent assises. Attendez la fin du temps avant de révéler.
5. Marquez les faux départs, puis choisissez Réussi ou Manqué. Les points ne sont
   attribués qu’une fois. Annuler les points permet de corriger la décision.
6. Passez à la manche suivante. Au bilan, exportez les résultats ou rejouez.

TIRAGE ET ÉGALITÉ DES CHANCES

Le nombre de questions doit être un multiple du nombre d’équipes. Le choix va
jusqu’à au moins 40 : 5 équipes proposent 5, 10, 15… 40 ; 2 équipes, 2, 4, 6… 40.
Avec 12 questions et 4 équipes, choisissez par exemple 12 manches pour 3 occasions
chacune. Le réglage affiche le quota et précise si des questions seront rejouées.

Les questions disponibles sont mélangées sans répétition immédiate. Si la partie
dépasse le nombre de questions de la liste, un nouveau mélange complet commence :
les questions reviennent au hasard, sans qu’une même question apparaisse deux manches de
suite. Leur nombre d’utilisations reste aussi égal que possible. Si la partie est
plus courte que la liste, les questions retenues le sont au hasard.

Le programme mélange sur toute la partie un tirage qui donne exactement le même
quota à chaque équipe : deux passages consécutifs d’une équipe restent possibles,
l’ordre reste imprévisible. Changer de liste, d’équipes ou de sens peut imposer
un nouveau choix.

L’égalité est garantie au terme des questions prévues. Si vous terminez plus tôt,
un avertissement et le bilan indiquent les occasions réellement jouées par équipe.
« Préparer une nouvelle partie » revient aux réglages et demande un nouveau choix.
Une ancienne partie reprise conserve son tirage initial, signalé à l’accueil.

MODES

Classique : chaque équipe cumule ses propres points, avec classement final.

Coopératif : fond vert menthe et grand tableau de classe, sans classement.
Le total des points est affiché en grand ; une jauge séparée suit les réussites
sans faux départ. L’objectif est d’atteindre
50, 70, 80 ou 100 % des manches réussies sans aucun faux départ. Le nombre requis
est arrondi au supérieur. Le total collectif applique votre barème à chaque
réussite, erreur et faux départ. Les corrections manuelles modifient les points,
mais pas le nombre de réussites. Terminer plus tôt conserve l’objectif initial.

Le mode bonus ×2 est supprimé. Une ancienne partie bonus reprend en classique :
les points déjà acquis sont conservés, les manches suivantes utilisent le barème simple.

À CONSOLIDER

Au bilan, ce bouton reprend uniquement les questions manquées ou ayant provoqué
un faux départ. Les scores repartent à zéro. Même avec une seule question à
revoir, la réserve complète fournit les mauvaises propositions.
La révision ciblée se joue ensemble en coopératif, sans classement : le nombre
de questions à revoir peut ne pas être un multiple des équipes. La liste originale
reste intacte. Les questions non jouées ne sont pas considérées comme manquées.
Les anciennes révisions reprennent également en coopératif, avec leurs scores.

UNE OU DEUX FENÊTRES

Par défaut, le jeu fonctionne dans une seule fenêtre, comme auparavant.

Le bouton Écran élèves ouvre, à la demande, une fenêtre de projection séparée.
Choisissez le projecteur ou un écran ; sur un autre écran, elle s’ouvre en plein
écran. Utilisez le bureau étendu de macOS pour avoir deux vues différentes.
Sur un seul écran, la seconde fenêtre peut être déplacée manuellement.

Sur le Mac, l’enseignant voit la réponse pendant la réflexion et garde les
commandes. L’écran élèves reçoit seulement la vue publique : question, colonnes,
compteur et scores. La solution et la bonne équipe n’y sont révélées qu’au signal.
Le contenu de la bibliothèque n’est pas envoyé à cette fenêtre.

Fermez la projection, ou choisissez « Revenir à une seule fenêtre », pour retrouver
le fonctionnement habituel. Pour changer d’écran, fermez puis rouvrez la projection.
Le menu Fenêtre et le raccourci macOS de changement de fenêtre permettent de passer
entre les deux. F ou un double-clic active le plein écran de la projection.
Le chronomètre continue quand vous passez d’une fenêtre à l’autre.

RACCOURCIS ET REPRISE

  Espace       Démarrer, pause/reprise, manche suivante selon l’étape
  Entrée       Révéler la réponse à la fin du temps
  G / P        Réussi / Manqué après révélation
  1 à 6        Marquer ou retirer un faux départ après révélation
  F            Activer ou quitter le plein écran
  ⌘S / Ctrl+S  Enregistrer la liste dans la préparation

Les boutons + et − proposent des corrections manuelles. En coopératif, ils
corrigent les points de la classe. La pause masque les propositions et conserve
le temps restant. Une fermeture permet de reprendre la partie. En mode simple,
masquer l’app pendant la réflexion met en pause ; la projection séparée permet
au chronomètre de continuer. L’app maintient l’écran éveillé pendant la partie.

SAUVEGARDE ET SOURCES

Listes, dossiers, brouillon, réglages et dernière partie restent sur le Mac :
  ~/Library/Application Support/StandUp Quiz/state-v2.json
Écriture atomique, copie .bak et copie locale du brouillon. Un export de bibliothèque
ne contient pas la partie ni les réglages ; le bilan s’exporte séparément en CSV.

Sources précédentes préservées :
  archive/StandUp-Quiz-1.0-sources.tar.gz
  archive/StandUp-Quiz-2.0-sources.tar.gz
  archive/StandUp-Quiz-2.1-sources.tar.gz

Développement avec Node.js récent :
  npm ci
  npm start
  npm run check
  npm test
  npm run build

La construction utilise un dossier temporaire propre pour éviter les métadonnées
Finder/iCloud qui invalident la signature. Electron 45.0.0, aucune ressource réseau
chargée par l’interface. Les contrôles de cette version sont dans AMELIORATIONS.md.

Code disponible sous licence MIT. Voir LICENSE.txt.
