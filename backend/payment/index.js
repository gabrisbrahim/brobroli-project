'use strict';
/**
 * Brobroli — Gestionnaire Central des Paiements & Séquestre Mobile Money
 * Gère CinetPay (Orange/MTN/Moov) & Wave Business CI
 */

const cinetpay = require('./cinetpay');
const wave = require('./wave');

/**
 * Initialiser un paiement sous séquestre
 */
async function initiateEscrowPayment({ provider, mission, appUrl }) {
  const transactionId = `tx_${mission.ref}_${Date.now()}`;
  const totalAmount = (mission.price || 0) + (mission.budget_vivres || 0);
  const baseUrl = appUrl.replace(/\/+$/, '');

  const returnUrl = `${baseUrl}/client?paid=${mission.id}&tx=${transactionId}`;
  const notifyUrl = `${baseUrl}/api/payments/webhook/${provider}`;

  if (provider === 'wave') {
    return await wave.createCheckoutSession({
      transactionId,
      amount: totalAmount,
      clientReference: mission.ref,
      successUrl: returnUrl,
      errorUrl: `${baseUrl}/client?err=payment_failed`
    });
  }

  // Par défaut : CinetPay (Orange Money, MTN, Moov, Carte)
  return await cinetpay.createPaymentSession({
    transactionId,
    amount: totalAmount,
    description: `Brobroli: ${mission.service_name} (${mission.ref})`,
    returnUrl,
    notifyUrl,
    customer: {
      name: mission.client_name,
      phone: mission.client_phone,
      address: mission.address
    }
  });
}

/**
 * Libérer le séquestre et verser les 88% net au Brobrosseur
 */
async function releaseEscrowToBrobrosseur({ mission, brob }) {
  const netAmount = mission.brob_net || Math.round(mission.price * 0.88);
  const phone = brob.phone || '0700000000';
  const name = brob.name || 'Brobrosseur';

  console.log(`[Séquestre Libéré] Course ${mission.ref} : ${netAmount} F versés à ${name} (${phone})`);

  if (mission.payment_method === 'wave') {
    return await wave.sendBrobrosseurPayout({
      amount: netAmount,
      phone,
      name,
      transactionId: `payout_${mission.ref}`
    });
  }

  return await cinetpay.sendBrobrosseurPayout({
    amount: netAmount,
    phone,
    name,
    transactionId: `payout_${mission.ref}`
  });
}

module.exports = {
  cinetpay,
  wave,
  initiateEscrowPayment,
  releaseEscrowToBrobrosseur
};
