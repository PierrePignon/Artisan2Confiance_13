'use strict';
// Génère une invitation calendrier (.ics) — s'ajoute automatiquement dans Google/Outlook/Apple.

function toICSDate(isoDate){ return isoDate.replace(/-/g, ''); } // AAAAMMJJ (journée entière)
function addDay(isoDate){ const p=isoDate.split('-'); const d=new Date(+p[0],+p[1]-1,+p[2]); d.setDate(d.getDate()+1);
  const pad=n=>(n<10?'0':'')+n; return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate()); }
function esc(s){ return String(s||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n'); }

// event: { uid, title, description, location, startISO, endISO }
function buildICS(ev){
  const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Réseaux Artisans de Confiance 13//Espace Chantier//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + (ev.uid || (Date.now()+'@artisandeconfiance13')),
    'DTSTAMP:' + now,
    'DTSTART;VALUE=DATE:' + toICSDate(ev.startISO),
    'DTEND;VALUE=DATE:' + addDay(ev.endISO), // fin exclusive => jour suivant la fin
    'SUMMARY:' + esc(ev.title),
    'DESCRIPTION:' + esc(ev.description),
    'LOCATION:' + esc(ev.location),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = { buildICS };
