'use strict';
const crypto = require('crypto');

// ---- Catalogue des métiers : label, durée par défaut (jours ouvrés), couleur ----
const METIERS = {
  demolition:            { l: 'Démolition / dépose',        d: 2, c: '#B0A392' },
  maconnerie:            { l: 'Maçonnerie / gros œuvre',    d: 4, c: '#C09A63' },
  plomberie_reseaux:     { l: 'Plomberie — réseaux',        d: 3, c: '#6E9BC0' },
  electricite_reseaux:   { l: 'Électricité — réseaux',      d: 3, c: '#DDB259' },
  platrerie:             { l: 'Plâtrerie / cloisons',       d: 3, c: '#C7BFB0' },
  menuiserie:            { l: 'Menuiserie / agencement',    d: 4, c: '#C08A4E' },
  ebenisterie:           { l: 'Ébénisterie sur mesure',     d: 5, c: '#A56A34' },
  carrelage:             { l: 'Carrelage / faïence',        d: 3, c: '#88AEB0' },
  pierre:                { l: 'Pierre / marbrerie',         d: 3, c: '#B2AB9C' },
  tadelakt:              { l: 'Tadelakt / enduits chaux',   d: 3, c: '#D0B48C' },
  plomberie_finitions:   { l: 'Plomberie — finitions',      d: 2, c: '#6E9BC0' },
  electricite_finitions: { l: 'Électricité — finitions',    d: 1, c: '#DDB259' },
  peinture:              { l: 'Peinture / décor',           d: 3, c: '#8FB06A' },
  ferronnerie:           { l: "Ferronnerie d'art",          d: 2, c: '#C0824A' },
  nettoyage:             { l: 'Nettoyage / livraison',      d: 1, c: '#A79E92' },
};

// ---- Modèles d'ordonnancement par type de projet (ordre des corps de métier) ----
const TEMPLATES = {
  'Salle de bain':            ['demolition','plomberie_reseaux','electricite_reseaux','maconnerie','carrelage','pierre','plomberie_finitions','electricite_finitions','peinture','nettoyage'],
  'Cuisine':                  ['demolition','plomberie_reseaux','electricite_reseaux','platrerie','ebenisterie','pierre','carrelage','plomberie_finitions','electricite_finitions','peinture','nettoyage'],
  'Escalier':                 ['maconnerie','pierre','ferronnerie','menuiserie','peinture','nettoyage'],
  'Bibliothèque / boiseries': ['electricite_reseaux','ebenisterie','peinture','electricite_finitions','nettoyage'],
  'Rénovation complète':      ['demolition','maconnerie','plomberie_reseaux','electricite_reseaux','platrerie','menuiserie','carrelage','pierre','ebenisterie','plomberie_finitions','electricite_finitions','tadelakt','peinture','ferronnerie','nettoyage'],
  'Autre':                    [],
};

const DEFAULT_SEMAINE = { '0':'block','1':'keys','2':'keys','3':'keys','4':'keys','5':'keys','6':'block' };

// ---- Dates : helpers jours ouvrés + semaine type + indispos ----
function pad(n){ return (n<10?'0':'')+n; }
function iso(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function parse(s){ if(!s) return null; const p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function dayOpen(ch, d, ind){
  const sem = ch.semaine || DEFAULT_SEMAINE;
  if ((sem[String(d.getDay())] || 'keys') === 'block') return false;
  if (ind && ind.has(iso(d))) return false;
  return true;
}
function nextOpen(ch, d, ind){ const x=new Date(d); let g=0; while(!dayOpen(ch,x,ind)){ x.setDate(x.getDate()+1); if(++g>2000) break; } return x; }
function addOpen(ch, s, n, ind){ let x=nextOpen(ch,s,ind), c=1; while(c<n){ x.setDate(x.getDate()+1); x=nextOpen(ch,x,ind); c++; } return x; }

// ---- Ordonnancement d'un chantier ----
function schedule(ch){
  const cur0 = parse(ch.dateDebut); if(!cur0) return;
  const cl = ch.clientIndispos || [];
  let cur = cur0;
  for (const it of ch.interventions){
    const ind = new Set(cl.concat(it.indispos || []));
    const st = nextOpen(ch, cur, ind);
    const en = addOpen(ch, st, Math.max(1, it.duree || 1), ind);
    it.dateDebut = iso(st); it.dateFin = iso(en);
    cur = new Date(en); cur.setDate(cur.getDate() + 1 + (ch.buffer || 0));
  }
}

// ---- Simulation d'un retard (recalcul du aval, sans muter) ----
function simulateDelay(ch, idx, addDays){
  const cl = ch.clientIndispos || [], its = ch.interventions, out = [];
  let cur = parse(its[idx].dateDebut);
  for (let j = idx; j < its.length; j++){
    const it = its[j], ind = new Set(cl.concat(it.indispos || [])), extra = (j===idx) ? addDays : 0;
    const st = nextOpen(ch, cur, ind), en = addOpen(ch, st, Math.max(1, (it.duree||1)+extra), ind);
    out.push({ id: it.id, metier: it.key, oldD: it.dateDebut, oldF: it.dateFin, newD: iso(st), newF: iso(en),
      changed: (iso(st)!==it.dateDebut || iso(en)!==it.dateFin), wasConfirmed: (it.confirmation==='confirmé'), isDelayed: (j===idx) });
    cur = new Date(en); cur.setDate(cur.getDate() + 1 + (ch.buffer || 0));
  }
  return out;
}

function token(){ return crypto.randomBytes(16).toString('hex'); }
function uid(){ return 'c' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

function newIntervention(key){
  const m = METIERS[key] || { l:key, d:2 };
  return { id: uid(), key, duree: m.d, artisanNom:'', artisanEmail:'', statut:'à planifier',
    indispos: [], dateDebut:'', dateFin:'', confirmation: null, token: token() };
}

function createChantier(data){
  const ch = {
    id: uid(), nom: data.nom, client: data.client || '', clientEmail: data.clientEmail || '',
    type: data.type, adresse: data.adresse || '', dateDebut: data.dateDebut,
    buffer: 0, semaine: { ...DEFAULT_SEMAINE }, clientIndispos: [], clientPrefs: {}, clientMessage: '',
    clientToken: token(), interventions: [], createdAt: new Date().toISOString(),
  };
  (TEMPLATES[data.type] || []).forEach(k => ch.interventions.push(newIntervention(k)));
  schedule(ch);
  return ch;
}

function livraison(ch){ const n=ch.interventions.length; return n ? ch.interventions[n-1].dateFin : ''; }

module.exports = { METIERS, TEMPLATES, DEFAULT_SEMAINE, iso, parse, schedule, simulateDelay,
  createChantier, newIntervention, token, uid, livraison };
