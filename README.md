# Espace Chantier — Réseaux Artisans de Confiance 13

Backend + API de coordination des travaux : ordonnancement automatique des corps de métier,
planning, gestion des retards en cascade, disponibilités du client (semaine type), et
convocations des artisans par email avec **invitation agenda (.ics)** — le tout via des
**liens personnels** (l'artisan et le client n'ont pas de compte à créer).

> **Où on en est.** Le **backend est complet et testé** (API, moteur d'ordonnancement,
> retards, emails Brevo, liens magiques, .ics). Les **pages artisan et client** (accessibles
> par lien perso) sont fonctionnelles. L'**interface complète du coordinateur** (celle du
> prototype) se branchera sur cette API à l'étape suivante — en attendant on pilote par l'API.

---

## 1. Tester en local (2 minutes)

Il te faut **Node 18+** installé sur ton ordinateur.

```bash
npm install
cp .env.example .env      # puis ouvre .env et mets un ADMIN_PASSWORD
npm start
```

Ouvre http://localhost:3000. Sans clé Brevo, les emails ne sont pas envoyés : ils
s'affichent dans le terminal (mode « dry-run »), pratique pour tester.

Créer un chantier (depuis un terminal, en remplaçant `TON_MOT_DE_PASSE`) :

```bash
curl -X POST http://localhost:3000/api/chantiers \
  -H "authorization: Bearer TON_MOT_DE_PASSE" -H "content-type: application/json" \
  -d '{"nom":"Salle de bain — Villa","client":"M. Dupont","clientEmail":"client@mail.fr","type":"Salle de bain","adresse":"12 chemin des Oliviers, Aix","dateDebut":"2026-09-14"}'
```

La réponse contient un `clientLink` (le lien à envoyer au client). Chaque intervention a
aussi son `token` d'artisan → lien `TON_URL/?a=LE_TOKEN`.

---

## 2. Créer le compte Brevo (emails)

1. Crée un compte sur **brevo.com** (gratuit jusqu'à ~300 emails/jour).
2. **Senders & IP** → ajoute et **valide l'adresse expéditeur** (ex. `contact@reseauxartisansdeconfiance13.fr`).
   Idéalement, valide aussi ton **domaine** (SPF/DKIM) pour ne pas tomber en spam — Brevo te
   donne les enregistrements DNS à ajouter chez ton hébergeur de domaine.
3. **SMTP & API → API Keys** → crée une clé. Copie-la : c'est ta `BREVO_API_KEY`.

---

## 3. Mettre sur GitHub + déploiement continu (git push = déploiement)

Le `.zip` sert juste à récupérer le code. Le dossier est **déjà un dépôt git prêt à pousser** :

```bash
git remote add origin https://github.com/TON_COMPTE/espace-chantier.git
git branch -M main
git push -u origin main
# (ou, avec la CLI GitHub :  gh repo create espace-chantier --private --source=. --push )
```

Ensuite, un hébergeur qui **redéploie tout seul à chaque `git push`** — le confort Vercel,
mais pour un backend avec données.

> **Pourquoi pas Vercel ?** Vercel = front/statique (comme la pharmacie) ou serverless *sans
> état*. Ici le backend **garde des données** (le planning) → il lui faut un disque
> persistant : **Fly.io / Railway / Render**. Et ici front + back = **une seule appli Node**
> (Express sert les pages), donc **un seul déploiement**, pas deux comme pour la plomberie.

Les variables à renseigner (quel que soit l'hébergeur) :

| Variable | Valeur |
|----------|--------|
| `ADMIN_PASSWORD` | un mot de passe solide (toi, coordinateur) |
| `BASE_URL` | l'URL publique, ex. `https://espace.reseauxartisansdeconfiance13.fr` |
| `BREVO_API_KEY` | la clé Brevo (étape 2) |
| `MAIL_FROM` | `contact@reseauxartisansdeconfiance13.fr` |
| `MAIL_FROM_NAME` | `Réseaux Artisans de Confiance 13` |
| `DATA_DIR` | `/data` |

### Option A — Fly.io (que tu connais déjà, comme le back plomberie)

Le projet inclut déjà `Dockerfile` + `fly.toml`.

```bash
fly launch --no-deploy      # crée l'app depuis fly.toml (choisis un nom unique)
fly volumes create espace_data --region cdg --size 1
fly secrets set ADMIN_PASSWORD=... BREVO_API_KEY=... MAIL_FROM=contact@reseauxartisansdeconfiance13.fr \
  MAIL_FROM_NAME="Réseaux Artisans de Confiance 13" BASE_URL=https://ton-app.fly.dev
fly deploy
```

**Push = déploiement** : une GitHub Action est déjà incluse
(`.github/workflows/deploy-fly.yml`). Ajoute juste le secret `FLY_API_TOKEN` dans ton dépôt
GitHub (Settings → Secrets → Actions) — génère-le avec `fly tokens create deploy`. À partir
de là, chaque `git push` sur `main` redéploie tout seul.

### Option B — Railway / Render (encore plus « façon Vercel », zéro config)

1. Connecte le dépôt GitHub → chaque push déclenche un déploiement automatiquement.
2. Ajoute un **volume/disk monté sur `/data`** (persistance) et `DATA_DIR=/data`.
3. Renseigne les variables du tableau ci-dessus. Start command : `npm start` (auto-détecté).
4. **Domaine** : ajoute `espace.reseauxartisansdeconfiance13.fr` (l'hébergeur te donne un **CNAME**
   à créer chez ton registrar), puis mets cette URL dans `BASE_URL`.

---

## 4. Sécurité (important)

- Choisis un **`ADMIN_PASSWORD` long et unique**.
- L'app doit être servie en **HTTPS** (Railway/Render le font automatiquement).
- Les liens perso (artisan/client) contiennent un jeton secret : ne les publie pas.

---

## 5. Ce qu'il reste à faire (prochaine étape)

- Brancher l'**interface complète du coordinateur** (le prototype) sur cette API.
- Le **rattrapage des conflits** en cas de retard (l'artisan refuse le nouveau créneau →
  re-planification locale à partir de lui).
- Option **SMS** (via un fournisseur) en plus de l'email.

---

## Structure du projet

```
src/
  engine.js   moteur métier (métiers, modèles, ordonnancement jours ouvrés, retards)
  store.js    stockage (fichier JSON ; interface prête pour passer à SQLite/Postgres)
  email.js    envoi via Brevo (dry-run si pas de clé)
  ics.js      génération des invitations agenda .ics
  server.js   API Express + service des pages
public/
  index.html  pages Artisan (?a=token) et Client (?c=token)
```

## Aperçu de l'API

| Méthode | Route | Accès | Rôle |
|--------|-------|-------|------|
| POST | `/api/login` | public | valider le mot de passe coordinateur |
| GET/PUT | `/api/state` | coordinateur | lire / enregistrer l'état complet |
| POST | `/api/chantiers` | coordinateur | créer un chantier (ordre auto) |
| POST | `/api/interventions/:id/notify` | coordinateur | envoyer la convocation (email + .ics) |
| POST | `/api/interventions/:id/delay` | coordinateur | simuler / appliquer un retard |
| GET | `/api/a/:token` | lien artisan | voir son intervention |
| POST | `/api/a/:token/confirm` | lien artisan | confirmer |
| GET | `/api/c/:token` | lien client | voir son chantier |
| POST | `/api/c/:token/availability` | lien client | enregistrer semaine type + absences |
