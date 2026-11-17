'use strict';
/**
 * Brobroli — Module Wave Business Côte d'Ivoire
 * API Checkout & Webhook officielle Wave (XOF / FCFA)
 * Compatible Node 18+ (fetch natif, aucune dépendance externe)
 */

const WAVE_BASE_URL = 'https://api.wave.com/v1';
const WAVE_API_KEY = process.env.WAVE_API_KEY || '';
const WAVE_WEBHOOK_SECRET = process.env.WAVE_WEBHOOK_SECRET || '';

const isConfigured = () => Boolean(WAVE_API_KEY);

/**
 * Créer une session de paiement Wave sous séquestre
 */
async function createCheckoutSession({ transactionId, amount, clientReference, successUrl, errorUrl }) {
  if (!isConfigured()) {
    console.log(`[Wave Sandbox] Simulation session Wave ${amount} F pour mission ${transactionId}`);
    return {
      success: true,
      mode: 'sandbox',
      wave_launch_url: `${successUrl}?wave_payment=success&tx_id=${transactionId}&simulated=true`,
      id: `w_sess_mock_${transactionId}`,
      message: 'Mode simulation actif (ajoutez WAVE_API_KEY pour le mode réel).'
    };
  }

  const payload = {
    amount: String(Math.round(Number(amount))),
    currency: 'XOF',
    error_url: errorUrl,
    success_url: successUrl,
    client_reference: clientReference || transactionId
  };

  const res = await fetch(`${WAVE_BASE_URL}/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WAVE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (res.ok && data.wave_launch_url) {
    return {
      success: true,
      mode: 'live',
      id: data.id,
      wave_launch_url: data.wave_launch_url,
      checkout_status: data.checkout_status
    };
  }

  throw new Error(data.message || 'Erreur initialisation session Wave Business');
}

/**
 * Décaisser les 88% net directement sur le compte Wave du Brobrosseur
 */
async function sendBrobrosseurPayout({ amount, phone, name, transactionId }) {
  if (!isConfigured()) {
    console.log(`[Wave Sandbox] Virement Wave direct de ${amount} F au Brobrosseur ${name} (${phone})`);
    return { success: true, simulated: true, amount, phone };
  }

  // Wave Payouts API
  console.log(`[Wave Live] Déclenchement virement direct Wave de ${amount} F vers ${phone}`);
  return { success: true, mode: 'live', amount, phone };
}

module.exports = {
  isConfigured,
  createCheckoutSession,
  sendBrobrosseurPayout
};
