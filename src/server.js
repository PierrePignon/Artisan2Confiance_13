'use strict';
const express = require('express');
const path = require('path');
const store = require('./store');
const engine = require('./engine');
const { sendEmail } = require('./email');
const { buildICS } = require('./ics');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const BASE_URL = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// ---- auth coordinateur (simple : mot de passe en Bearer) ----
function admin(req, res, next){
  if ((req.headers.authorization || '') === 'Bearer ' + ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'unauthorized' });
}
function fmt(iso){ if(!iso) return '—'; const M=['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc']; const p=iso.split('-'); return (+p[2])+' '+M[+p[1]-1]; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Gabarit email HTML — sobre, un seul bouton d'action bien visible.
function emailShell({ title, greeting, intro, rows, ctaLabel, ctaUrl, outro, secondaryLabel, secondaryUrl }){
  const rowsHtml = (rows || []).map(r =>
    '<tr><td style="padding:4px 0;color:#8a857c;font-size:13px;width:150px;vertical-align:top">' + esc(r[0]) + '</td>' +
    '<td style="padding:4px 0;color:#26251f;font-size:14px;font-weight:600">' + esc(r[1]) + '</td></tr>').join('');
  const btn = ctaUrl ? (
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr>' +
    '<td style="border-radius:9px;background:#26251f"><a href="' + esc(ctaUrl) + '" ' +
    'style="display:inline-block;padding:14px 30px;font-family:Georgia,\'Times New Roman\',serif;font-size:15px;color:#ffffff;text-decoration:none;border-radius:9px;letter-spacing:.2px">' +
    esc(ctaLabel) + '</a></td></tr></table>') : '';
  const secondary = secondaryUrl ? (
    '<p style="margin:8px 0 0"><a href="' + esc(secondaryUrl) + '" style="color:#8a6d3b;font-size:13px;text-decoration:underline">' + esc(secondaryLabel) + '</a></p>') : '';
  const fallback = ctaUrl ? (
    '<p style="margin:22px 0 0;color:#b3ada2;font-size:12px;line-height:1.5">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>' +
    '<span style="color:#8a6d3b;word-break:break-all">' + esc(ctaUrl) + '</span></p>') : '';
  return '<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:28px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ece7dd">' +
    '<tr><td style="background:#26251f;padding:20px 32px"><span style="font-family:Georgia,serif;color:#f4f1ea;font-size:15px;letter-spacing:.5px">Réseaux Artisans de Confiance 13</span></td></tr>' +
    '<tr><td style="padding:32px 32px 34px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">' +
    '<h1 style="margin:0 0 18px;font-family:Georgia,\'Times New Roman\',serif;font-size:22px;color:#26251f;font-weight:600;line-height:1.25">' + esc(title) + '</h1>' +
    '<p style="margin:0 0 6px;color:#26251f;font-size:15px">' + esc(greeting) + '</p>' +
    (intro ? '<p style="margin:0 0 14px;color:#4a463e;font-size:14px;line-height:1.6">' + esc(intro) + '</p>' : '') +
    (rowsHtml ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px;border-top:1px solid #ece7dd;border-bottom:1px solid #ece7dd;width:100%">' +
      '<tr><td style="padding:12px 0"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">' + rowsHtml + '</table></td></tr></table>' : '') +
    btn + secondary + fallback +
    (outro ? '<p style="margin:24px 0 0;color:#4a463e;font-size:14px;line-height:1.6">' + esc(outro) + '</p>' : '') +
    '<p style="margin:26px 0 0;color:#8a857c;font-size:13px">Bien à vous,<br>Réseaux Artisans de Confiance 13 — Coordination</p>' +
    '</td></tr></table>' +
    '<p style="margin:16px 0 0;color:#b3ada2;font-size:11px;font-family:-apple-system,Segoe UI,Arial,sans-serif">Réseaux Artisans de Confiance 13 · Bouches-du-Rhône</p>' +
    '</td></tr></table></body></html>';
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Catalogue métiers / modèles / semaine type — pour l'interface coordinateur
app.get('/api/meta', (req, res) => res.json({
  metiers: engine.METIERS, templates: engine.TEMPLATES, defaultSemaine: engine.DEFAULT_SEMAINE }));

app.post('/api/login', (req, res) => {
  if ((req.body || {}).password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'bad_password' });
});

// ===== COORDINATEUR =====
app.get('/api/state', admin, (req, res) => res.json(store.get()));

app.put('/api/state', admin, (req, res) => {
  const next = req.body;
  if (!next || typeof next !== 'object' || !next.chantiers) return res.status(400).json({ error: 'bad_state' });
  for (const id of next.order || []) { const ch = next.chantiers[id]; if (ch) engine.schedule(ch); }
  store.set(next);
  res.json({ ok: true });
});

app.post('/api/chantiers', admin, (req, res) => {
  const ch = engine.createChantier(req.body || {});
  const s = store.get(); s.chantiers[ch.id] = ch; s.order.unshift(ch.id); store.save();
  res.json({ ok: true, chantier: ch,
    clientLink: BASE_URL + '/?c=' + ch.clientToken });
});

// Notifier un artisan (convocation + invitation agenda)
app.post('/api/interventions/:id/notify', admin, async (req, res) => {
  const s = store.get(); let found = null;
  for (const cid of s.order) { const ch = s.chantiers[cid]; if(!ch) continue;
    const idx = ch.interventions.findIndex(x => x.id === req.params.id);
    if (idx >= 0) { found = { ch, it: ch.interventions[idx], idx }; break; } }
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { ch, it, idx } = found;
  if (!it.artisanEmail) return res.status(400).json({ error: 'no_email' });
  const m = engine.METIERS[it.key] || { l: it.key };
  const link = BASE_URL + '/?a=' + it.token;
  const text = `Bonjour ${it.artisanNom ? it.artisanNom.split(' ')[0] : ''},

Dans le cadre du chantier « ${ch.nom} » (${ch.adresse || 'adresse à confirmer'}), votre intervention (${m.l}) est planifiée :

  • Début : ${fmt(it.dateDebut)}
  • Fin prévue : ${fmt(it.dateFin)}
  • Durée : ${it.duree || 1} jours ouvrés
  • Position : ${idx + 1} sur ${ch.interventions.length}

Confirmez votre disponibilité en un clic : ${link}

Bien à vous,
Réseaux Artisans de Confiance 13 — Coordination`;
  const html = emailShell({
    title: `Intervention planifiée — ${m.l}`,
    greeting: `Bonjour ${it.artisanNom ? it.artisanNom.split(' ')[0] : ''},`.trim(),
    intro: `Dans le cadre du chantier « ${ch.nom} »${ch.adresse ? ' (' + ch.adresse + ')' : ''}, votre intervention est planifiée aux dates suivantes.`,
    rows: [ ['Corps de métier', m.l], ['Début', fmt(it.dateDebut)], ['Fin prévue', fmt(it.dateFin)],
      ['Durée', (it.duree || 1) + ' jours ouvrés'], ['Position', (idx + 1) + ' sur ' + ch.interventions.length] ],
    ctaLabel: 'Confirmer ma disponibilité', ctaUrl: link,
    outro: 'Vous pouvez aussi proposer une autre date depuis ce lien. Une invitation agenda (.ics) est jointe à cet email pour ajouter l\'intervention à votre calendrier.' });
  const ics = buildICS({ uid: it.id + '@adc13', title: `Chantier « ${ch.nom} » — ${m.l}`,
    description: `Intervention ${m.l}. Confirmez : ${link}`, location: ch.adresse || '',
    startISO: it.dateDebut, endISO: it.dateFin });
  try {
    const r = await sendEmail({ to: it.artisanEmail, toName: it.artisanNom,
      subject: `Planning chantier « ${ch.nom} » — ${m.l}`, text, html,
      ics, icsFilename: 'intervention.ics' });
    it.statut = it.statut === 'à planifier' ? 'planifié' : it.statut; store.save();
    res.json({ ok: true, dryRun: !!r.dryRun });
  } catch (e) { res.status(502).json({ error: 'email_failed', message: e.message }); }
});

// Envoyer au particulier son lien de suivi
app.post('/api/chantiers/:id/notify-client', admin, async (req, res) => {
  const s = store.get(); const ch = s.chantiers[req.params.id];
  if (!ch) return res.status(404).json({ error: 'not_found' });
  if (!ch.clientEmail) return res.status(400).json({ error: 'no_email' });
  const link = BASE_URL + '/?c=' + ch.clientToken;
  const liv = engine.livraison(ch);
  const text = `Bonjour${ch.client ? ' ' + ch.client : ''},

Votre chantier « ${ch.nom} »${ch.adresse ? ' (' + ch.adresse + ')' : ''} est suivi via votre espace personnel.

Depuis votre lien, vous pouvez régler vos disponibilités (les jours où vous êtes présent, où vous déposez les clés) et suivre l'avancement des travaux.${liv ? `

  • Livraison prévue : ${fmt(liv)}` : ''}

Votre espace personnel : ${link}

Bien à vous,
Réseaux Artisans de Confiance 13 — Coordination`;
  const html = emailShell({
    title: `Votre espace de suivi — « ${ch.nom} »`,
    greeting: `Bonjour${ch.client ? ' ' + ch.client : ''},`,
    intro: `Votre chantier${ch.adresse ? ' (' + ch.adresse + ')' : ''} est désormais suivi via votre espace personnel. Depuis votre lien, vous réglez vos disponibilités (jours de présence, remise des clés) et suivez l'avancement des travaux en temps réel.`,
    rows: liv ? [ ['Livraison prévue', fmt(liv)] ] : null,
    ctaLabel: 'Accéder à mon espace', ctaUrl: link });
  try {
    const r = await sendEmail({ to: ch.clientEmail, toName: ch.client || '',
      subject: `Votre chantier « ${ch.nom} » — espace de suivi`, text, html });
    res.json({ ok: true, dryRun: !!r.dryRun });
  } catch (e) { res.status(502).json({ error: 'email_failed', message: e.message }); }
});

// Simuler / appliquer un retard
app.post('/api/interventions/:id/delay', admin, (req, res) => {
  const s = store.get(); let found = null;
  for (const cid of s.order) { const ch = s.chantiers[cid]; if(!ch) continue;
    const idx = ch.interventions.findIndex(x => x.id === req.params.id);
    if (idx >= 0) { found = { ch, idx }; break; } }
  if (!found) return res.status(404).json({ error: 'not_found' });
  const { ch, idx } = found;
  const addDays = Math.max(1, parseInt((req.body || {}).addDays) || 1);
  const sim = engine.simulateDelay(ch, idx, addDays);
  if ((req.body || {}).apply) {
    const byId = Object.fromEntries(ch.interventions.map(x => [x.id, x]));
    for (const sChg of sim) { const it = byId[sChg.id]; it.dateDebut = sChg.newD; it.dateFin = sChg.newF;
      if (sChg.changed && sChg.wasConfirmed && !sChg.isDelayed) { it.confirmation = null; it.statut = 'planifié'; } }
    store.save();
  }
  res.json({ ok: true, sim });
});

// ===== ARTISAN (lien magique, sans compte) =====
app.get('/api/a/:token', (req, res) => {
  const f = store.findByArtisanToken(req.params.token);
  if (!f) return res.status(404).json({ error: 'not_found' });
  const { ch, it } = f; const idx = ch.interventions.indexOf(it); const m = engine.METIERS[it.key] || { l: it.key };
  res.json({ chantier: { nom: ch.nom, adresse: ch.adresse, total: ch.interventions.length },
    intervention: { metier: m.l, position: idx + 1, dateDebut: it.dateDebut, dateFin: it.dateFin,
      duree: it.duree, statut: it.statut, confirmation: it.confirmation } });
});
app.post('/api/a/:token/confirm', (req, res) => {
  const f = store.findByArtisanToken(req.params.token); if (!f) return res.status(404).json({ error: 'not_found' });
  f.it.confirmation = 'confirmé'; f.it.statut = 'confirmé'; store.save(); res.json({ ok: true });
});
app.post('/api/a/:token/propose', (req, res) => {
  const f = store.findByArtisanToken(req.params.token); if (!f) return res.status(404).json({ error: 'not_found' });
  f.it.confirmation = 'autre'; f.it.proposedDate = (req.body || {}).date || ''; f.it.statut = 'à planifier'; store.save();
  res.json({ ok: true });
});
app.get('/api/a/:token/event.ics', (req, res) => {
  const f = store.findByArtisanToken(req.params.token); if (!f) return res.status(404).send('not found');
  const { ch, it } = f; const m = engine.METIERS[it.key] || { l: it.key };
  const ics = buildICS({ uid: it.id + '@adc13', title: `Chantier « ${ch.nom} » — ${m.l}`,
    description: m.l, location: ch.adresse || '', startISO: it.dateDebut, endISO: it.dateFin });
  res.set('Content-Type', 'text/calendar; charset=utf-8').send(ics);
});

// ===== CLIENT (lien magique) =====
app.get('/api/c/:token', (req, res) => {
  const ch = store.findByClientToken(req.params.token); if (!ch) return res.status(404).json({ error: 'not_found' });
  res.json({ nom: ch.nom, adresse: ch.adresse, type: ch.type, semaine: ch.semaine || engine.DEFAULT_SEMAINE,
    clientIndispos: ch.clientIndispos || [], clientPrefs: ch.clientPrefs || {}, clientMessage: ch.clientMessage || '',
    livraison: engine.livraison(ch),
    interventions: ch.interventions.map(it => ({ metier: (engine.METIERS[it.key]||{}).l || it.key,
      dateDebut: it.dateDebut, dateFin: it.dateFin, couleur: (engine.METIERS[it.key]||{}).c })) });
});
app.post('/api/c/:token/availability', (req, res) => {
  const ch = store.findByClientToken(req.params.token); if (!ch) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.semaine) ch.semaine = b.semaine;
  if (Array.isArray(b.clientIndispos)) ch.clientIndispos = b.clientIndispos;
  if (b.clientPrefs) ch.clientPrefs = b.clientPrefs;
  if (typeof b.clientMessage === 'string') ch.clientMessage = b.clientMessage;
  engine.schedule(ch); store.save();
  res.json({ ok: true, livraison: engine.livraison(ch) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Espace Chantier — API sur ' + BASE_URL + ' (port ' + PORT + ')'));
