'use strict';
// Envoi d'emails via Brevo (API transactionnelle HTTP). Aucune dépendance : on utilise fetch (Node 18+).
// Config par variables d'environnement :
//   BREVO_API_KEY   = ta clé API Brevo (obligatoire pour envoyer pour de vrai)
//   MAIL_FROM       = adresse expéditeur validée dans Brevo (ex: contact@artisandeconfiance13.fr)
//   MAIL_FROM_NAME  = nom affiché (ex: Réseaux Artisans de Confiance 13)
// Sans clé, on passe en "dry-run" : on logue l'email au lieu de l'envoyer (pratique pour tester).

async function sendEmail({ to, toName, subject, html, text, ics, icsFilename }) {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM || 'no-reply@example.com';
  const fromName = process.env.MAIL_FROM_NAME || 'Réseaux Artisans de Confiance 13';

  const attachment = ics ? [{ content: Buffer.from(ics, 'utf8').toString('base64'),
    name: icsFilename || 'rendez-vous.ics' }] : undefined;

  if (!key) {
    console.log('\n[email:dry-run] (pas de BREVO_API_KEY) —>');
    console.log('  À        :', to, toName ? '(' + toName + ')' : '');
    console.log('  Objet    :', subject);
    console.log('  Texte    :', (text || '').slice(0, 300).replace(/\n/g, '\n            '));
    if (ics) console.log('  Pièce    :', icsFilename || 'rendez-vous.ics', '(invitation agenda)');
    console.log('');
    return { dryRun: true, ok: true };
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: fromName },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html || ('<pre style="font-family:inherit">' + (text || '') + '</pre>'),
      textContent: text || undefined,
      attachment,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Brevo ' + res.status + ' : ' + body.slice(0, 300));
  }
  return { ok: true };
}

module.exports = { sendEmail };
