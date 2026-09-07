'use strict';
// Stockage simple : un fichier JSON. Suffisant pour ce volume (quelques chantiers).
// Pour passer à l'échelle plus tard : remplacer par SQLite/Postgres (même interface load/save).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

function ensure(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

function load(){
  ensure();
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) { console.error('[store] lecture impossible, repart à vide :', e.message); }
  return { chantiers: {}, order: [] };
}

let _state = load();

function get(){ return _state; }

function save(){
  ensure();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(_state, null, 2));
  fs.renameSync(tmp, FILE); // écriture atomique
}

function set(next){ _state = next; save(); }

// Recherche par jeton (lien magique)
function findByClientToken(t){
  for (const id of _state.order){ const ch=_state.chantiers[id]; if(ch && ch.clientToken===t) return ch; }
  return null;
}
function findByArtisanToken(t){
  for (const id of _state.order){ const ch=_state.chantiers[id]; if(!ch) continue;
    for (const it of ch.interventions){ if(it.token===t) return { ch, it }; } }
  return null;
}

module.exports = { get, save, set, load, findByClientToken, findByArtisanToken, FILE, DATA_DIR };
