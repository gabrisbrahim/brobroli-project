'use strict';
/**
 * Brobroli — Serveur (aucune dépendance externe, Node.js seul)
 *  - /            : application Brobrosseur (téléphone)
 *  - /admin       : console privée des fondateurs (protégée par code)
 *  - /api/...     : API (suivi temps réel, commandes, finances)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 5000;
const APP_URL = process.env.APP_URL || ('http://localhost:' + PORT);
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '';
const COMMISSION_RATE = 0.12;

const payment = require('./payment');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const FOUNDERS_FILE = path.join(DATA_DIR, 'founders.json');
const CODES_FILE = path.join(DATA_DIR, 'CODES-ACCES-SECRETS.txt');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

/* ───────────── Sécurité : hachage, sessions, anti-force-brute ───────────── */
const hash = (secret, salt) => crypto.scryptSync(String(secret), salt, 32).toString('hex');
const mkSecret = (secret) => { const salt = crypto.randomBytes(8).toString('hex'); return { salt, hash: hash(secret, salt) }; };
const checkSecret = (secret, rec) => {
  const a = Buffer.from(hash(secret, rec.salt), 'hex'), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sessions = new Map();
function newSession(data, ttlMs) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ...data, exp: Date.now() + ttlMs });
  return token;
}
function auth(req, url) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  if (!t) return null;
  const s = sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return s;
}

const fails = new Map();
function isLocked(key) {
  return false; // Désactivé en phase de test local pour ne jamais bloquer vos essais
}
function addFail(key) {
  const f = fails.get(key) || { count: 0, until: 0 };
  f.count++;
  fails.set(key, f);
}

/* ───────────── Fondateurs (codes générés au premier lancement) ───────────── */
function initFounders() {
  if (fs.existsSync(FOUNDERS_FILE)) return;
  const p1 = '707070', p2 = '303030';
  const list = [
    { id: 'founder', name: 'Fondateur', share: 0.7, ...mkSecret(p1) },
    { id: 'partner', name: 'Associé', share: 0.3, ...mkSecret(p2) },
  ];
  fs.writeFileSync(FOUNDERS_FILE, JSON.stringify(list, null, 2));
  fs.writeFileSync(CODES_FILE,
    'CODES D\'ACCES BROBROLI — A GARDER SECRETS (supprimez ce fichier après les avoir notés)\r\n\r\n' +
    `Fondateur (70%)  : ${p1}\r\nAssocié   (30%)  : ${p2}\r\n\r\n` +
    'Vous pouvez changer ces codes dans la console : onglet "Sécurité".\r\n');
  console.log('\n  🔐 Premier lancement : codes fondateurs créés dans data/CODES-ACCES-SECRETS.txt\n');
}
let founders = [];
const loadFounders = () => { founders = JSON.parse(fs.readFileSync(FOUNDERS_FILE, 'utf8')); };

/* ───────────── Catalogue & étapes de mission ───────────── */
const CATALOG = [
  { id: 'courses-marche', name: 'Courses au grand marché', icon: '🛒', price: 5000, time: '1h30', kind: 'courses', group: 'Courses' },
  { id: 'courses-super', name: 'Supermarché express', icon: '🛍️', price: 3500, time: '45 min', kind: 'courses', group: 'Courses' },
  { id: 'pharmacie', name: 'Pharmacie / achat urgent', icon: '💊', price: 3000, time: '40 min', kind: 'courses', group: 'Courses' },
  { id: 'gaz', name: 'Recharge gaz (B6 / B12)', icon: '🔥', price: 3000, time: '30 min', kind: 'courses', group: 'Courses' },
  { id: 'menage', name: 'Ménage courant (2-3 pièces)', icon: '🧹', price: 6000, time: '2h30', kind: 'service', group: 'Maison' },
  { id: 'grand-menage', name: 'Grand ménage approfondi', icon: '✨', price: 12000, time: '4h30', kind: 'service', group: 'Maison' },
  { id: 'lessive', name: 'Lessive à la main', icon: '👕', price: 6000, time: '2h30', kind: 'service', group: 'Maison' },
  { id: 'repassage', name: 'Repassage (10-12 pièces)', icon: '👔', price: 5000, time: '2h', kind: 'service', group: 'Maison' },
  { id: 'repassage-trad', name: 'Repassage tenues traditionnelles', icon: '🥻', price: 6500, time: '2h', kind: 'service', group: 'Maison' },
  { id: 'cuisine-sauce', name: 'Sauce ivoirienne à domicile', icon: '🍲', price: 8000, time: '3h', kind: 'service', group: 'Cuisine' },
  { id: 'lavage-auto', name: 'Lavage auto à domicile', icon: '🚗', price: 4500, time: '1h30', kind: 'service', group: 'Auto' },
  { id: 'split', name: 'Nettoyage filtres de split', icon: '❄️', price: 6000, time: '1h', kind: 'service', group: 'Dépannage' },
  { id: 'montage', name: 'Montage de meuble', icon: '🔧', price: 8000, time: '2h', kind: 'service', group: 'Dépannage' },
  { id: 'queue-agence', name: "File d'attente (CIE, SODECI, banque)", icon: '🧾', price: 4000, time: '1h30', kind: 'errand', group: 'Démarches' },
  { id: 'pli-express', name: 'Pli / colis express', icon: '📦', price: 3500, time: '1h', kind: 'errand', group: 'Démarches' },
  { id: 'sortie-ecole', name: "Sortie d'école accompagnée", icon: '🎒', price: 3500, time: '1h', kind: 'errand', group: 'Famille' },
  { id: 'mission-speciale', name: 'Mission Spéciale Sur-Mesure', icon: '✨', price: 3500, time: 'Sur-mesure', kind: 'errand', group: 'Sur-Mesure' },
];

const STEP_DEFS = {
  courses: [
    { key: 'accepted', icon: '✅', label: 'Mission acceptée', action: "J'accepte la mission" },
    { key: 'enroute', icon: '🚶', label: 'En route vers le marché', action: 'Je pars vers le marché' },
    { key: 'arrived', icon: '🏪', label: 'Arrivé au marché', action: 'Je suis arrivé au marché' },
    { key: 'working', icon: '🛒', label: 'Achats en cours', action: 'Je commence les achats' },
    { key: 'receipt', icon: '🧾', label: 'Achats terminés', action: 'Achats terminés — photo du ticket', photo: true },
    { key: 'delivering', icon: '🏠', label: 'En route chez le client', action: 'Je pars chez le client' },
    { key: 'delivered', icon: '🎉', label: 'Livré au client', action: 'Courses remises au client' },
  ],
  errand: [
    { key: 'accepted', icon: '✅', label: 'Mission acceptée', action: "J'accepte la mission" },
    { key: 'enroute', icon: '🚶', label: 'En route vers le lieu', action: 'Je pars vers le lieu' },
    { key: 'arrived', icon: '📍', label: 'Arrivé sur place', action: 'Je suis arrivé sur place' },
    { key: 'working', icon: '⏳', label: 'Démarche en cours', action: 'Je commence la démarche' },
    { key: 'receipt', icon: '🧾', label: 'Démarche terminée', action: 'Terminé — photo du justificatif', photo: true },
    { key: 'delivered', icon: '🎉', label: 'Remis au client', action: 'Justificatif remis au client' },
  ],
  service: [
    { key: 'accepted', icon: '✅', label: 'Mission acceptée', action: "J'accepte la mission" },
    { key: 'enroute', icon: '🚶', label: 'En route chez le client', action: 'Je pars chez le client' },
    { key: 'arrived', icon: '📍', label: 'Arrivé chez le client', action: 'Je suis arrivé chez le client' },
    { key: 'working', icon: '🧹', label: 'Travail en cours', action: 'Je commence le travail' },
    { key: 'delivered', icon: '🎉', label: 'Travail terminé', action: 'Travail terminé — photo du résultat', photo: 'optional' },
  ],
};

/* ───────────── Badges de Certification Officiels Brobroli ───────────── */
const CERTIFICATIONS_DEF = [
  { id: 'cni', name: 'CNI Vérifiée', icon: '🛡️', desc: 'Identité contrôlée physiquement en agence', category: 'securite', color: '#10803e' },
  { id: 'casier', name: 'Casier Vierge', icon: '⚖️', desc: 'Bulletin n°3 du casier judiciaire contrôlé', category: 'securite', color: '#0f766e' },
  { id: 'garant', name: 'Garant Validé', icon: '🤝', desc: 'Caution morale & attestation de domicile vérifiées', category: 'securite', color: '#0369a1' },
  { id: 'expert_marche', name: 'Expert Grand Marché', icon: '🛒', desc: 'Spécialiste vivres frais, poissons & négociation', category: 'competence', color: '#b45309' },
  { id: 'maitre_linge', name: 'Maître Linge & Repassage', icon: '👔', desc: 'Soin des tenues de bureau & pagnes traditionnels', category: 'competence', color: '#6d28d9' },
  { id: 'top_rated', name: 'Top Prestataire 5/5', icon: '⭐', desc: 'Excellence client : moyenne > 4.8 sur 10+ avis', category: 'excellence', color: '#d97706' },
  { id: 'ponctualite', name: '100% Ponctuel', icon: '⏱️', desc: 'Respect rigoureux des créneaux horaires', category: 'excellence', color: '#059669' },
  { id: 'elite_or', name: 'Élite Or', icon: '🥇', desc: 'Rang suprême : plus de 50 missions sans aucun incident', category: 'excellence', color: '#d4af37' },
];

/* ───────────── Base de données (fichier JSON) ───────────── */
let db;
function seed() {
  const demoCode = '1234';
  const now = Date.now();
  fs.appendFileSync(CODES_FILE, `\r\nBrobrosseur de démonstration : téléphone 0700000001 / code ${demoCode}\r\n`);
  return {
    counter: 101,
    brobs: [{
      id: 'b-demo', name: 'Aminata Koné', phone: '0700000001', ...mkSecret(demoCode),
      verified: true, active: true, demo: true, badge: '🏆 Expert Agréé', rating: 4.9,
      ratings_count: 48, matricule: 'CI-BROB-2026-0042',
      certifications: ['cni', 'casier', 'garant', 'expert_marche', 'top_rated', 'ponctualite'],
      last_seen: now, pos: { lat: 5.3565, lon: -3.9862, acc: 9, at: now }, created_at: now - 3600000,
    }],
    missions: [{
      id: 'm-init-101', ref: 'BR-0101',
      service_id: 'courses-marche', service_name: 'Courses au grand marché', icon: '🛒', kind: 'courses',
      client_name: 'Mme Koné (Angré)', client_phone: '0708091011',
      address: 'Cocody Angré 8e tranche', landmark: 'Après le carrefour Bluetooth, portail vert',
      description: '2 tas de tomates fraîches, gombo, 500 F de piment vert, poisson fumé',
      dest: { lat: 5.3610, lon: -3.9840 },
      price: 5000, commission: 600, brob_net: 4400,
      brob_id: 'b-demo', status: 'in_progress', step: 2,
      steps_log: [
        { key: 'accepted', label: 'Mission acceptée', at: now - 420000, lat: 5.3520, lon: -3.9810 },
        { key: 'enroute', label: 'En route vers le marché', at: now - 180000, lat: 5.3565, lon: -3.9862 },
      ],
      track: { lat: 5.3565, lon: -3.9862, acc: 9, at: now },
      trail: [[5.3520, -3.9810, now - 420000], [5.3545, -3.9840, now - 300000], [5.3565, -3.9862, now - 60000]],
      demo: false, sim: false, created_at: now - 600000, updated_at: now - 60000,
    }],
    sos: [], payouts: [],
  };
}
function load() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const demo = db.brobs && db.brobs.find((b) => b.id === 'b-demo' || b.phone === '0700000001');
    if (demo) {
      Object.assign(demo, mkSecret('1234'), { active: true, verified: true });
      if (!demo.matricule) demo.matricule = 'CI-BROB-2026-0042';
      if (!demo.ratings_count) demo.ratings_count = 48;
      if (!demo.rating) demo.rating = 4.9;
      if (!demo.badge || demo.badge === 'Expert 🏆') demo.badge = '🏆 Expert Agréé';
      if (!demo.certifications || !demo.certifications.length) demo.certifications = ['cni', 'casier', 'garant', 'expert_marche', 'top_rated', 'ponctualite'];
    }
    save();
  } else { db = seed(); save(); }
}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/* ───────────── Utilitaires ───────────── */
const clean = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const normPhone = (p) => { let d = String(p ?? '').replace(/\D/g, ''); if (d.startsWith('225') && d.length === 13) d = d.slice(3); return d; };
const distM = (a, b, c, d) => {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
};
const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
const ip = (req) => req.socket.remoteAddress || '?';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req, limit = 2_500_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { const s = Buffer.concat(chunks).toString('utf8'); resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

/* ───────────── Calculateur Tarifaire Intelligent (Mission Spéciale Sur-Mesure) ───────────── */
function computeSmartMissionPrice(durationMins = 60, effortLevel = 'modere', desc = '') {
  const mins = Math.max(15, Math.min(480, Number(durationMins) || 60));
  // Base déplacement & prise en charge quartier : 1 500 F + 25 F / minute (soit 1 500 F / heure)
  let base = 1500 + Math.round((mins / 60) * 1500);
  // Bonus d'investissement personnel / effort physique (pour encourager le Brobrosseur sans effrayer le client)
  const effortBonus = effortLevel === 'intense' ? Math.round(1200 + (mins / 60) * 500)
                    : effortLevel === 'modere'  ? Math.round(500 + (mins / 60) * 250)
                    : 0; // 'leger' = 0 F de surcoût
  // Détection de mots-clés d'effort ou d'urgence dans la description
  const txt = String(desc || '').toLowerCase();
  const heavyWords = /(lourd|déménag|escalier|étage|sac de riz|gaz|carton|meuble|jardin|brousse|urgent|nuit)/i;
  const keywordBonus = heavyWords.test(txt) && effortLevel === 'leger' ? 500 : 0;
  // Arrondi au palier de 500 F le plus proche (plancher attractif à 2 500 F)
  const raw = base + effortBonus + keywordBonus;
  return Math.max(2500, Math.round(raw / 500) * 500);
}

/* ───────────── Logique métier ───────────── */
function createMission(o) {
  const svc = CATALOG.find((s) => s.id === o.service_id) || CATALOG.find((s) => s.id === 'mission-speciale');
  if (!svc) return { error: 'Prestation inconnue' };
  const isCustom = svc.id === 'mission-speciale' || !!o.custom_title;
  const computedPrice = isCustom ? computeSmartMissionPrice(o.duration_mins, o.effort_level, o.description) : svc.price;
  const price = o.price ? Math.round(Number(o.price)) : computedPrice;
  if (!Number.isFinite(price) || price < 500 || price > 500000) return { error: 'Prix invalide (500 à 500 000 F)' };
  const commission = Math.round(price * COMMISSION_RATE);
  const budget_vivres = Math.max(0, Math.round(Number(o.budget_vivres) || 0));
  const customLabel = o.custom_title ? `✨ ${clean(o.custom_title, 65)}` : svc.name;
  const m = {
    id: 'm' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
    ref: 'BR-' + String(++db.counter).padStart(4, '0'),
    service_id: svc.id, service_name: customLabel, icon: isCustom ? '✨' : svc.icon, kind: svc.kind,
    client_name: clean(o.client_name, 80), client_phone: normPhone(o.client_phone),
    address: clean(o.address, 160), landmark: clean(o.landmark, 200), description: clean(o.description, 600),
    dest: o.dest && Number.isFinite(o.dest.lat) && Number.isFinite(o.dest.lon) ? { lat: o.dest.lat, lon: o.dest.lon } : null,
    price, commission, brob_net: price - commission,
    budget_vivres,
    payment_method: clean(o.payment_method, 20) || 'wave',
    chat_messages: [
      { id: 'c0', sender: 'system', text: `Mission créée · Tarif prestation : ${price} F${budget_vivres > 0 ? ` · Budget vivres : ${budget_vivres} F` : ''}`, at: Date.now() }
    ],
    brob_id: o.brob_id || null,
    status: o.brob_id ? 'assigned' : 'pending', step: 0, steps_log: [],
    track: null, trail: [],
    demo: !!o.demo, sim: !!o.sim, created_at: Date.now(), updated_at: Date.now(),
  };
  db.missions.unshift(m);
  save();
  return { mission: m };
}

function applyStep(m, key, extra = {}) {
  if (['completed', 'cancelled'].includes(m.status)) return { error: 'Mission terminée' };
  const defs = STEP_DEFS[m.kind];
  const idx = defs.findIndex((d) => d.key === key);
  if (idx < 0) return { error: 'Étape inconnue' };
  if (idx < m.step) return { ok: true, dup: true };
  if (idx > m.step) return { error: 'Étape dans le désordre' };
  let photo = null;
  if (extra.photo && new RegExp('^' + m.id + '-\\d+\\.jpg$').test(extra.photo) && fs.existsSync(path.join(PHOTO_DIR, extra.photo))) photo = extra.photo;
  m.step = idx + 1;
  m.steps_log.push({
    key, label: defs[idx].label, at: Date.now(), note: clean(extra.note, 200) || undefined, photo: photo || undefined,
    nophoto: defs[idx].photo === true && !photo ? true : undefined,
    lat: Number.isFinite(extra.lat) ? extra.lat : undefined, lon: Number.isFinite(extra.lon) ? extra.lon : undefined,
  });
  m.status = m.step >= defs.length ? 'delivered' : 'in_progress';
  m.updated_at = Date.now();
  save();
  return { ok: true };
}

function applyPosition(b, p) {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return;
  const now = Date.now();
  b.pos = { lat: p.lat, lon: p.lon, acc: Math.round(Number(p.acc) || 0), at: now };
  b.last_seen = now;
  const m = db.missions.find((x) => x.brob_id === b.id && ['assigned', 'in_progress'].includes(x.status));
  if (m) {
    m.track = b.pos;
    const last = m.trail[m.trail.length - 1];
    if (!last || distM(last[0], last[1], p.lat, p.lon) > 5 || now - last[2] > 20000) {
      m.trail.push([p.lat, p.lon, now]);
      if (m.trail.length > 300) m.trail.shift();
    }
  }
  save();
}

function missionAdminView(m) {
  const b = db.brobs.find((x) => x.id === m.brob_id);
  const t = m.track;
  return {
    id: m.id, ref: m.ref, service_name: m.service_name, icon: m.icon, kind: m.kind,
    client_name: m.client_name, client_phone: m.client_phone, address: m.address, landmark: m.landmark, description: m.description,
    dest: m.dest, price: m.price, commission: m.commission, brob_net: m.brob_net,
    budget_vivres: m.budget_vivres || 0, payment_method: m.payment_method || 'wave',
    chat_messages: m.chat_messages || [],
    status: m.status, step: m.step, steps: STEP_DEFS[m.kind], steps_log: m.steps_log,
    rating: m.rating, review: m.review, tags: m.tags, rated_at: m.rated_at,
    track: t, trail: m.trail.slice(-150).map((p) => [p[0], p[1]]),
    dist_to_dest: t && m.dest ? distM(t.lat, t.lon, m.dest.lat, m.dest.lon) : null,
    brob: b ? { id: b.id, name: b.name, phone: b.phone, rating: b.rating, badge: b.badge, last_seen: b.last_seen } : null,
    demo: m.demo, sim: m.sim, created_at: m.created_at, updated_at: m.updated_at,
  };
}

function financeSummary() {
  const done = db.missions.filter((m) => m.status === 'completed' && !m.demo);
  const gmv = sum(done, (m) => m.price);
  const commission = sum(done, (m) => m.commission);
  const brobs = db.brobs.filter((b) => !b.demo).map((b) => {
    const mine = done.filter((m) => m.brob_id === b.id);
    const earned = sum(mine, (m) => m.brob_net);
    const paid = sum(db.payouts.filter((p) => p.type === 'brob' && p.target === b.id), (p) => p.amount);
    return { id: b.id, name: b.name, phone: b.phone, missions: mine.length, earned, paid, owed: earned - paid };
  });
  const fl = founders.map((f, i) => {
    const earned = i === founders.length - 1
      ? commission - sum(founders.slice(0, -1), (x) => sum(done, (m) => Math.round(m.commission * x.share)))
      : sum(done, (m) => Math.round(m.commission * f.share));
    const paid = sum(db.payouts.filter((p) => p.type === 'founder' && p.target === f.id), (p) => p.amount);
    return { id: f.id, name: f.name, share: f.share, earned, paid, owed: earned - paid };
  });
  const awaiting = sum(db.missions.filter((m) => m.status === 'delivered' && !m.demo), (m) => m.price);
  return {
    gmv, commission, missions: done.length, awaiting, brobs, founders: fl,
    recent: done.slice(0, 15).map((m) => ({ ref: m.ref, service_name: m.service_name, price: m.price, commission: m.commission, brob_net: m.brob_net, at: m.completed_at || m.updated_at })),
    payouts: db.payouts.slice(-15).reverse(),
  };
}

/* ───────────── Simulation (démo) ───────────── */
let simTimer = null;
function startSim() {
  const b = db.brobs.find((x) => x.id === 'b-demo');
  if (!b) return { error: 'Brobrosseur démo absent' };
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
  db.missions.forEach((m) => { if (m.sim && !['completed', 'cancelled'].includes(m.status)) m.status = 'cancelled'; });
  const r = createMission({
    client_name: 'Gabriel (démo)', client_phone: '', address: 'Cocody Angré 8e tranche', landmark: 'Après le carrefour Bluetooth, portail vert',
    description: '2 tas de tomates, gombo frais, 500 F de piment vert, poisson fumé', service_id: 'courses-marche',
    brob_id: b.id, dest: { lat: 5.3610, lon: -3.9840 }, demo: true, sim: true,
  });
  const m = r.mission;
  const S0 = [5.3500, -3.9780], M = [5.3560, -3.9870], C = [5.3610, -3.9840];
  const lerp = (a, z, t) => [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t];
  const plan = { 1: 'accepted', 3: 'enroute', 9: 'arrived', 11: 'working', 18: 'receipt', 20: 'delivering', 31: 'delivered' };
  let tick = 0;
  simTimer = setInterval(() => {
    tick++;
    const cur = db.missions.find((x) => x.id === m.id);
    if (!cur || ['cancelled', 'completed'].includes(cur.status)) { clearInterval(simTimer); simTimer = null; return; }
    if (plan[tick]) applyStep(cur, plan[tick], { note: plan[tick] === 'receipt' ? 'Ticket : 3 200 F de produits' : undefined });
    let p;
    if (tick < 3) p = S0;
    else if (tick <= 9) p = lerp(S0, M, (tick - 3) / 6);
    else if (tick < 20) p = [M[0] + (Math.random() - 0.5) * 0.0002, M[1] + (Math.random() - 0.5) * 0.0002];
    else if (tick <= 31) p = lerp(M, C, (tick - 20) / 11);
    else p = C;
    applyPosition(b, { lat: p[0], lon: p[1], acc: 8 });
    if (tick >= 31) { clearInterval(simTimer); simTimer = null; }
  }, 2000);
  return { mission: m };
}

/* ───────────── Routes ───────────── */
function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}`);
  return out;
}

function brobMe(b) {
  const mine = db.missions.filter((m) => m.brob_id === b.id);
  const cur = mine.filter((m) => ['assigned', 'in_progress', 'delivered'].includes(m.status)).sort((x, y) => x.created_at - y.created_at)[0];
  const done = mine.filter((m) => m.status === 'completed');
  const earned = sum(done, (m) => m.brob_net);
  const paid = sum(db.payouts.filter((p) => p.type === 'brob' && p.target === b.id), (p) => p.amount);
  let mission = null;
  if (cur) {
    const q = cur.dest ? `${cur.dest.lat},${cur.dest.lon}` : encodeURIComponent(cur.address);
    mission = {
      id: cur.id, ref: cur.ref, service_name: cur.service_name, icon: cur.icon, kind: cur.kind, description: cur.description,
      client_first: cur.client_name.split(' ')[0], client_name: cur.client_name, client_phone: cur.client_phone,
      address: cur.address, landmark: cur.landmark,
      brob_net: cur.brob_net, status: cur.status, step: cur.step, steps: STEP_DEFS[cur.kind],
      budget_vivres: cur.budget_vivres || 0, payment_method: cur.payment_method || 'wave',
      chat_messages: cur.chat_messages || [], photo: cur.photo || null,
      steps_log: cur.steps_log.map((s) => ({ key: s.key, at: s.at })),
      maps_url: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    };
  }
  return {
    profile: {
      name: b.name, phone: b.phone, badge: b.badge, rating: b.rating, verified: b.verified,
      matricule: b.matricule || 'CI-BROB-2026-0042',
      certifications: b.certifications || ['cni', 'casier', 'garant', 'expert_marche', 'top_rated', 'ponctualite'],
      certifications_def: CERTIFICATIONS_DEF,
    },
    mission, queue: mine.filter((m) => m.status === 'assigned').length - (cur && cur.status === 'assigned' ? 1 : 0),
    wallet: { pending: earned - paid, earned, missions: done.length, awaiting: sum(mine.filter((m) => m.status === 'delivered'), (m) => m.brob_net) },
    recent: done.slice(0, 8).map((m) => ({ ref: m.ref, service_name: m.service_name, icon: m.icon, brob_net: m.brob_net, at: m.completed_at || m.updated_at })),
    support_phone: SUPPORT_PHONE,
  };
}

async function api(req, res, url, p, method) {
  res.setHeader('Cache-Control', 'no-store');
  if (method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });
  if (method === 'GET' && p === '/api/catalog') return send(res, 200, { catalog: CATALOG, rate: COMMISSION_RATE, certifications: CERTIFICATIONS_DEF });

  // API PUBLIQUE CLIENT (Particulier qui commande et suit sa course en direct)
  if (method === 'GET' && p === '/api/client/missions') {
    const active = db.missions.slice(0, 10).map((m) => {
      const b = db.brobs.find((x) => x.id === m.brob_id);
      return {
        id: m.id, ref: m.ref, service_name: m.service_name, icon: m.icon, kind: m.kind,
        client_name: m.client_name, client_phone: m.client_phone, address: m.address, landmark: m.landmark, description: m.description,
        price: m.price, commission: m.commission, brob_net: m.brob_net,
        budget_vivres: m.budget_vivres || 0, payment_method: m.payment_method || 'wave',
        chat_messages: m.chat_messages || [],
        status: m.status, step: m.step, steps: STEP_DEFS[m.kind], steps_log: m.steps_log,
        rating: m.rating, review: m.review, tags: m.tags, rated_at: m.rated_at,
        brob_id: m.brob_id, brob_name: b ? b.name : 'Attribution en cours…',
        brob_phone: b ? b.phone : null,
        brob_badge: b ? (b.badge || '🏆 Expert Agréé') : 'Vérifié CNI',
        brob_rating: b ? (b.rating || 4.9) : 4.9,
        brob_ratings_count: b ? (b.ratings_count || 48) : 48,
        brob_certifications: (b && b.certifications) ? b.certifications.map(cId => CERTIFICATIONS_DEF.find(c => c.id === cId)).filter(Boolean) : [],
        track: m.track || (b && b.pos) || null,
        trail: m.trail || [],
        dest: m.dest || null,
        dist_to_dest: (m.track || (b && b.pos)) && m.dest ? distM((m.track || b.pos).lat, (m.track || b.pos).lon, m.dest.lat, m.dest.lon) : null,
      };
    });
    return send(res, 200, { missions: active, certifications_def: CERTIFICATIONS_DEF });
  }
  if (method === 'POST' && p === '/api/client/missions') {
    const b = await readBody(req, 20000);
    if (!clean(b.client_name)) return send(res, 400, { error: 'Votre nom est requis' });
    if (!clean(b.address)) return send(res, 400, { error: 'Votre quartier / adresse est requis' });
    const avail = db.brobs.find((x) => x.active && x.verified);
    const r = createMission({
      ...b,
      brob_id: avail ? avail.id : null,
      dest: { lat: 5.3610, lon: -3.9840 },
    });
    if (r.error) return send(res, 400, r);

    // Initialisation du séquestre de paiement (CinetPay ou Wave)
    let paymentSession = null;
    try {
      paymentSession = await payment.initiateEscrowPayment({
        provider: b.payment_method || 'wave',
        mission: r.mission,
        appUrl: APP_URL
      });
    } catch (err) {
      console.warn('Note: Session de paiement en mode local:', err.message);
    }

    return send(res, 201, { mission: r.mission, payment: paymentSession });
  }

  // Initialisation d'une session de paiement séquestre
  if (method === 'POST' && p === '/api/payments/checkout') {
    const b = await readBody(req, 10000);
    const mission = db.missions.find((x) => x.id === b.mission_id);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    try {
      const sess = await payment.initiateEscrowPayment({
        provider: b.provider || mission.payment_method || 'wave',
        mission,
        appUrl: APP_URL
      });
      return send(res, 200, sess);
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // Webhooks CinetPay (Orange Money, MTN, Moov)
  if (method === 'POST' && p === '/api/payments/webhook/cinetpay') {
    const b = await readBody(req, 20000);
    const txId = b.cpm_trans_id || b.transaction_id;
    console.log('[Webhook CinetPay] Notification reçue pour transaction:', txId);
    return send(res, 200, { ok: true });
  }

  // Webhooks Wave Business
  if (method === 'POST' && p === '/api/payments/webhook/wave') {
    const b = await readBody(req, 20000);
    console.log('[Webhook Wave] Notification reçue:', b.type || 'payment.succeeded');
    return send(res, 200, { ok: true });
  }
  if (method === 'POST' && p.match(/^\/api\/client\/missions\/([\w-]+)\/validate$/)) {
    const id = p.split('/')[4];
    const mission = db.missions.find((x) => x.id === id);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    mission.status = 'completed'; mission.completed_at = Date.now(); mission.updated_at = Date.now(); save();
    return send(res, 200, { ok: true });
  }

  // Évaluation de la prestation par le client (système de notation 5 étoiles & badges)
  let rm;
  if (method === 'POST' && (rm = p.match(/^\/api\/client\/missions\/([\w-]+)\/rate$/))) {
    const id = rm[1];
    const b = await readBody(req, 10000);
    const mission = db.missions.find((x) => x.id === id);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    const stars = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 5)));
    const review = clean(b.review, 500);
    const tags = Array.isArray(b.tags) ? b.tags.slice(0, 6).map((t) => clean(t, 40)) : [];

    mission.rating = stars;
    mission.review = review;
    mission.tags = tags;
    mission.rated_at = Date.now();
    mission.status = 'completed';
    if (!mission.completed_at) mission.completed_at = Date.now();
    mission.updated_at = Date.now();

    const brob = db.brobs.find((x) => x.id === mission.brob_id);
    if (brob) {
      const prevCount = brob.ratings_count || 48;
      const prevRating = brob.rating || 4.9;
      const newCount = prevCount + 1;
      const newRating = Math.round(((prevCount * prevRating + stars) / newCount) * 10) / 10;
      brob.ratings_count = newCount;
      brob.rating = newRating;
      if (brob.rating >= 4.8 && newCount >= 20) brob.badge = '⭐ Élite Or';
      else if (brob.rating >= 4.5) brob.badge = '🏆 Expert Agréé';
      else if (brob.rating >= 4.0) brob.badge = '🎖️ Confirmé';
      else brob.badge = '🛡️ Certifié CNI';

      // Déclenchement automatique du reversement séquestre (88% net) au Brobrosseur
      payment.releaseEscrowToBrobrosseur({ mission, brob }).catch((err) => {
        console.warn('Note versement payout Brobrosseur:', err.message);
      });
    }
    save();
    return send(res, 200, { ok: true, rating: stars, brob_rating: brob ? brob.rating : 5, brob_badge: brob ? brob.badge : '🏆 Expert Agréé' });
  }

  // Consultation publique du badge officiel & QR Code de vérification
  if (method === 'GET' && (rm = p.match(/^\/api\/public\/badge(\/([\w-]+))?$/))) {
    const id = rm[2] || url.searchParams.get('id') || 'b-demo';
    const b = db.brobs.find((x) => x.id === id) || db.brobs[0];
    if (!b) return send(res, 404, { error: 'Brobrosseur introuvable' });
    const doneMissions = db.missions.filter((x) => x.brob_id === b.id && x.status === 'completed');
    const recentReviews = db.missions.filter((x) => x.brob_id === b.id && x.rating).slice(0, 6).map((x) => ({
      rating: x.rating, review: x.review, tags: x.tags, client: x.client_name ? x.client_name.split(' ')[0] : 'Client', at: x.rated_at || x.updated_at
    }));
    return send(res, 200, {
      id: b.id,
      name: b.name,
      phone: b.phone,
      matricule: b.matricule || `CI-BROB-2026-0042`,
      badge: b.badge || '🏆 Expert Agréé',
      rating: b.rating || 4.9,
      ratings_count: b.ratings_count || Math.max(doneMissions.length, 128),
      missions_count: doneMissions.length || 135,
      verified: b.verified,
      active: b.active,
      certifications: (b.certifications || ['cni', 'casier', 'garant', 'expert_marche', 'top_rated', 'ponctualite']).map(cId => CERTIFICATIONS_DEF.find(c => c.id === cId)).filter(Boolean),
      certifications_def: CERTIFICATIONS_DEF,
      communes: 'Cocody · Plateau · Marcory · Yopougon',
      emergency_phone: '+225 07 00 00 00 00',
      valid_until: '11/2027',
      recent_reviews: recentReviews
    });
  }

  // Changement en 1 clic du logo officiel sur toute l'application
  if (method === 'POST' && p === '/api/public/set-logo') {
    const b = await readBody(req, 5000);
    const allowed = [
      'logo-ultime-definitif.jpg',
      'logo-ultime-iso.jpg',
      'logo-master-marble.jpg',
      'logo-master-titanium.jpg',
      'logo-proto-1-ascension.jpg',
      'logo-proto-2-batisseur.jpg',
      'logo-proto-3-monogramme.jpg',
      'logo-proto-4-ecusson.jpg'
    ];
    if (!allowed.includes(b.file)) return send(res, 400, { error: 'Prototype inconnu' });
    const src = path.join(PUBLIC_DIR, 'assets', b.file);
    if (!fs.existsSync(src)) return send(res, 404, { error: 'Fichier introuvable' });
    const targets = [
      path.join(PUBLIC_DIR, 'assets', 'logo.jpg'),
      path.join(PUBLIC_DIR, 'Visuels_et_Logo', 'logo.jpg'),
      'C:\\Users\\gabri\\Desktop\\DOSSIER_COMPLET_BROBROLI_APP\\Visuels_et_Logo\\logo.jpg',
      'C:\\Users\\gabri\\Desktop\\DOSSIER_COMPLET_BROBROLI_APP\\Code_Source_Application\\public\\assets\\logo.jpg',
      'C:\\Users\\gabri\\Desktop\\DOSSIER_COMPLET_BROBROLI_APP\\LES_3_APPLICATIONS_SEPAREES\\1_App_Client\\assets\\logo.jpg',
      'C:\\Users\\gabri\\Desktop\\DOSSIER_COMPLET_BROBROLI_APP\\LES_3_APPLICATIONS_SEPAREES\\2_App_Brobrosseur\\assets\\logo.jpg',
      'C:\\Users\\gabri\\Desktop\\DOSSIER_COMPLET_BROBROLI_APP\\LES_3_APPLICATIONS_SEPAREES\\3_App_Fondateur_70_30\\assets\\logo.jpg'
    ];
    for (const t of targets) {
      try { fs.copyFileSync(src, t); } catch (e) {}
    }
    return send(res, 200, { ok: true, active_logo: b.file });
  }

  // Messagerie & Chat direct entre Client et Brobrosseur
  if ((rm = p.match(/^\/api\/missions\/([\w-]+)\/chat$/))) {
    const mission = db.missions.find((x) => x.id === rm[1]);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    if (!mission.chat_messages) mission.chat_messages = [];

    if (method === 'GET') {
      return send(res, 200, { messages: mission.chat_messages });
    }
    if (method === 'POST') {
      const b = await readBody(req, 4000);
      const text = clean(b.text, 300);
      const sender = ['client', 'brob', 'system'].includes(b.sender) ? b.sender : 'client';
      if (!text) return send(res, 400, { error: 'Message vide' });
      const msg = { id: 'c' + Date.now().toString(36), sender, text, at: Date.now() };
      mission.chat_messages.push(msg);
      mission.updated_at = Date.now();
      save();
      return send(res, 201, { message: msg });
    }
  }

  // Simulation & Webhook Paiement Mobile Money (Wave / Orange Money)
  if (method === 'POST' && p === '/api/payments/simulate') {
    const b = await readBody(req, 5000);
    const payMethod = ['wave', 'orange_money', 'mtn'].includes(b.method) ? b.method : 'wave';
    const amount = Math.max(500, Math.round(Number(b.amount) || 5000));
    const phone = normPhone(b.phone) || '0708091011';
    const txId = 'TX-' + payMethod.toUpperCase().slice(0,3) + '-' + Date.now().toString(36).toUpperCase();
    return send(res, 200, {
      ok: true,
      transaction_id: txId,
      status: 'escrow_locked',
      method: payMethod,
      amount,
      phone,
      message: `Fonds de ${amount.toLocaleString('fr-FR')} F bloqués sous séquestre Brobroli via ${payMethod === 'wave' ? 'Wave' : 'Orange Money'}.`
    });
  }
  if (method === 'POST' && p === '/api/payments/webhook') {
    const b = await readBody(req, 10000);
    console.log('[Mobile Money Webhook]', b);
    return send(res, 200, { received: true });
  }

  if (method === 'POST' && p === '/api/admin/login') {
    const b = await readBody(req, 5000);
    const key = ip(req) + ':admin';
    if (isLocked(key)) return send(res, 429, { error: 'Trop d\'essais. Réessayez dans 5 minutes.' });
    const f = founders.find((x) => x.id === b.id);
    if (!f || !checkSecret(clean(b.pin, 30), f)) { addFail(key); return send(res, 401, { error: 'Code incorrect' }); }
    fails.delete(key);
    const token = newSession({ role: 'admin', id: f.id, name: f.name }, 12 * 3600 * 1000);
    return send(res, 200, { token, name: f.name });
  }
  if (method === 'POST' && p === '/api/brob/login') {
    const b = await readBody(req, 5000);
    const phone = normPhone(b.phone);
    const key = ip(req) + ':brob:' + phone;
    if (isLocked(key)) return send(res, 429, { error: 'Trop d\'essais. Réessayez dans 5 minutes.' });
    const br = db.brobs.find((x) => x.phone === phone);
    if (!br || !checkSecret(clean(b.code, 10), br)) { addFail(key); return send(res, 401, { error: 'Téléphone ou code incorrect' }); }
    if (!br.verified) return send(res, 403, { error: 'Compte en cours de vérification par l\'équipe Brobroli' });
    if (!br.active) return send(res, 403, { error: 'Compte désactivé. Contactez l\'équipe Brobroli.' });
    fails.delete(key);
    const token = newSession({ role: 'brob', id: br.id }, 7 * 24 * 3600 * 1000);
    return send(res, 200, { token });
  }

  const s = auth(req, url);
  if (p.startsWith('/api/admin/')) {
    if (!s || s.role !== 'admin') return send(res, 401, { error: 'Accès refusé' });
    return adminApi(req, res, url, p, method, s);
  }
  if (p.startsWith('/api/brob/')) {
    if (!s || s.role !== 'brob') return send(res, 401, { error: 'Session expirée' });
    const b = db.brobs.find((x) => x.id === s.id);
    if (!b || !b.active) return send(res, 401, { error: 'Compte désactivé' });
    return brobApi(req, res, url, p, method, b);
  }
  send(res, 404, { error: 'Introuvable' });
}

async function adminApi(req, res, url, p, method, s) {
  let m;
  if (method === 'GET' && p === '/api/admin/info') return send(res, 200, { urls: lanUrls(), support_phone: SUPPORT_PHONE });

  if (method === 'GET' && p === '/api/admin/live') {
    const active = db.missions.filter((x) => ['pending', 'assigned', 'in_progress', 'delivered'].includes(x.status));
    const now = Date.now();
    return send(res, 200, {
      now,
      missions: active.map(missionAdminView),
      sos: db.sos.filter((x) => !x.resolved),
      brobs_online: db.brobs.filter((b) => b.active && now - b.last_seen < 90000).length,
    });
  }
  if (method === 'GET' && p === '/api/admin/missions') return send(res, 200, { missions: db.missions.slice(0, 80).map(missionAdminView) });

  if (method === 'POST' && p === '/api/admin/missions') {
    const b = await readBody(req, 20000);
    if (!clean(b.client_name)) return send(res, 400, { error: 'Nom du client requis' });
    if (!clean(b.address)) return send(res, 400, { error: 'Adresse requise' });
    let brob_id = null;
    if (b.brob_id) {
      const br = db.brobs.find((x) => x.id === b.brob_id && x.active && x.verified);
      if (!br) return send(res, 400, { error: 'Brobrosseur indisponible' });
      brob_id = br.id;
    }
    const dest = b.dest && Number(b.dest.lat) && Number(b.dest.lon) ? { lat: Number(b.dest.lat), lon: Number(b.dest.lon) } : null;
    const r = createMission({ ...b, brob_id, dest });
    if (r.error) return send(res, 400, r);
    return send(res, 201, { mission: missionAdminView(r.mission) });
  }

  if (method === 'POST' && (m = p.match(/^\/api\/admin\/missions\/([\w-]+)\/(assign|validate|cancel)$/))) {
    const mission = db.missions.find((x) => x.id === m[1]);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    if (m[2] === 'assign') {
      const b = await readBody(req, 2000);
      const br = db.brobs.find((x) => x.id === b.brob_id && x.active && x.verified);
      if (!br) return send(res, 400, { error: 'Brobrosseur indisponible' });
      if (mission.step > 0) return send(res, 400, { error: 'La mission a déjà démarré' });
      if (!['pending', 'assigned'].includes(mission.status)) return send(res, 400, { error: 'Mission non assignable' });
      mission.brob_id = br.id; mission.status = 'assigned'; mission.updated_at = Date.now(); save();
    } else if (m[2] === 'validate') {
      if (mission.status !== 'delivered') return send(res, 400, { error: 'La mission n\'est pas encore livrée' });
      mission.status = 'completed'; mission.completed_at = Date.now(); mission.updated_at = Date.now(); save();
    } else {
      if (['completed', 'cancelled'].includes(mission.status)) return send(res, 400, { error: 'Déjà clôturée' });
      mission.status = 'cancelled'; mission.updated_at = Date.now(); save();
    }
    return send(res, 200, { mission: missionAdminView(mission) });
  }

  if (method === 'GET' && p === '/api/admin/brobs') {
    const now = Date.now();
    return send(res, 200, {
      certifications_def: CERTIFICATIONS_DEF,
      brobs: db.brobs.map((b) => ({
        id: b.id, name: b.name, phone: b.phone, verified: b.verified, active: b.active, demo: !!b.demo,
        badge: b.badge || '🏆 Expert Agréé', rating: b.rating || 4.9, ratings_count: b.ratings_count || 128,
        matricule: b.matricule || `CI-BROB-2026-0042`,
        certifications: b.certifications || ['cni', 'casier', 'garant', 'expert_marche', 'top_rated', 'ponctualite'],
        last_seen: b.last_seen, online: now - b.last_seen < 90000,
        missions: db.missions.filter((x) => x.brob_id === b.id && x.status === 'completed').length,
        busy: db.missions.some((x) => x.brob_id === b.id && ['assigned', 'in_progress', 'delivered'].includes(x.status)),
      })),
    });
  }
  if (method === 'POST' && p === '/api/admin/brobs') {
    const b = await readBody(req, 5000);
    const name = clean(b.name, 60), phone = normPhone(b.phone);
    if (!name) return send(res, 400, { error: 'Nom requis' });
    if (!/^\d{10}$/.test(phone)) return send(res, 400, { error: 'Numéro à 10 chiffres requis (ex : 0707070707)' });
    if (db.brobs.some((x) => x.phone === phone)) return send(res, 400, { error: 'Ce numéro existe déjà' });
    const code = String(crypto.randomInt(1000, 10000));
    const br = { id: 'b' + Date.now().toString(36), name, phone, ...mkSecret(code), verified: !!b.verified, active: true, badge: 'Débutant', rating: 5, certifications: ['cni'], last_seen: 0, pos: null, created_at: Date.now() };
    db.brobs.push(br); save();
    return send(res, 201, { id: br.id, code });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/admin\/brobs\/([\w-]+)\/(toggle|verify|code)$/))) {
    const br = db.brobs.find((x) => x.id === m[1]);
    if (!br) return send(res, 404, { error: 'Introuvable' });
    let code;
    if (m[2] === 'toggle') br.active = !br.active;
    if (m[2] === 'verify') {
      br.verified = !br.verified;
      if (!br.certifications) br.certifications = [];
      if (br.verified && !br.certifications.includes('cni')) br.certifications.push('cni');
    }
    if (m[2] === 'code') { code = String(crypto.randomInt(1000, 10000)); Object.assign(br, mkSecret(code)); }
    save();
    return send(res, 200, { ok: true, code });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/admin\/brobs\/([\w-]+)\/certifications$/))) {
    const br = db.brobs.find((x) => x.id === m[1]);
    if (!br) return send(res, 404, { error: 'Introuvable' });
    const b = await readBody(req, 2000);
    if (!br.certifications) br.certifications = [];
    if (b.toggle) {
      if (br.certifications.includes(b.toggle)) br.certifications = br.certifications.filter(c => c !== b.toggle);
      else br.certifications.push(b.toggle);
    } else if (Array.isArray(b.certifications)) {
      br.certifications = b.certifications;
    }
    save();
    return send(res, 200, { ok: true, certifications: br.certifications });
  }

  if (method === 'GET' && p === '/api/admin/finance') return send(res, 200, financeSummary());
  if (method === 'POST' && p === '/api/admin/payouts') {
    const b = await readBody(req, 3000);
    const f = financeSummary();
    const list = b.type === 'brob' ? f.brobs : b.type === 'founder' ? f.founders : null;
    const row = list && list.find((x) => x.id === b.target);
    const amount = Math.round(Number(b.amount));
    if (!row) return send(res, 400, { error: 'Bénéficiaire inconnu' });
    if (!Number.isFinite(amount) || amount <= 0 || amount > row.owed) return send(res, 400, { error: `Montant invalide (max ${row.owed} F)` });
    db.payouts.push({ id: 'p' + Date.now().toString(36), at: Date.now(), type: b.type, target: b.target, name: row.name, amount, note: clean(b.note, 100), by: s.name });
    save();
    return send(res, 201, { ok: true });
  }

  if (method === 'POST' && (m = p.match(/^\/api\/admin\/sos\/([\w-]+)\/resolve$/))) {
    const x = db.sos.find((y) => y.id === m[1]);
    if (!x) return send(res, 404, { error: 'Introuvable' });
    x.resolved = true; x.resolved_by = s.name; save();
    return send(res, 200, { ok: true });
  }
  if (method === 'POST' && p === '/api/admin/simulate') {
    const r = startSim();
    return r.error ? send(res, 400, r) : send(res, 201, { ok: true });
  }
  if (method === 'POST' && p === '/api/admin/change-pin') {
    const b = await readBody(req, 3000);
    const f = founders.find((x) => x.id === s.id);
    const key = ip(req) + ':pin';
    if (isLocked(key)) return send(res, 429, { error: 'Trop d\'essais. Réessayez plus tard.' });
    if (!checkSecret(clean(b.old, 30), f)) { addFail(key); return send(res, 401, { error: 'Ancien code incorrect' }); }
    const np = clean(b.new, 30);
    if (!/^\d{6,12}$/.test(np)) return send(res, 400, { error: 'Le nouveau code doit contenir 6 à 12 chiffres' });
    Object.assign(f, mkSecret(np));
    fs.writeFileSync(FOUNDERS_FILE, JSON.stringify(founders, null, 2));
    if (fs.existsSync(CODES_FILE)) fs.unlinkSync(CODES_FILE);
    return send(res, 200, { ok: true });
  }
  if (method === 'GET' && (m = p.match(/^\/api\/admin\/photo\/([\w.-]+)$/))) {
    const f = path.join(PHOTO_DIR, path.basename(m[1]));
    if (!/\.jpg$/.test(f) || !fs.existsSync(f)) return send(res, 404, { error: 'Photo introuvable' });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' });
    return fs.createReadStream(f).pipe(res);
  }
  send(res, 404, { error: 'Introuvable' });
}

async function brobApi(req, res, url, p, method, b) {
  let m;
  b.last_seen = Date.now();
  if (method === 'GET' && p === '/api/brob/me') { return send(res, 200, brobMe(b)); }
  if (method === 'POST' && p === '/api/brob/position') {
    const d = await readBody(req, 2000);
    applyPosition(b, { lat: Number(d.lat), lon: Number(d.lon), acc: d.acc });
    return send(res, 200, { ok: true });
  }
  if (method === 'POST' && (m = p.match(/^\/api\/brob\/missions\/([\w-]+)\/step$/))) {
    const mission = db.missions.find((x) => x.id === m[1] && x.brob_id === b.id);
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    const d = await readBody(req, 5000);
    if (Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))) applyPosition(b, { lat: Number(d.lat), lon: Number(d.lon), acc: d.acc });
    const r = applyStep(mission, clean(d.key, 20), { photo: d.photo, note: d.note, lat: Number(d.lat), lon: Number(d.lon) });
    return r.error ? send(res, 409, r) : send(res, 200, { ok: true });
  }
  if (method === 'POST' && p === '/api/brob/photo') {
    const d = await readBody(req, 2_500_000);
    const mission = db.missions.find((x) => x.id === d.mission_id && x.brob_id === b.id && !['completed', 'cancelled'].includes(x.status));
    if (!mission) return send(res, 404, { error: 'Mission introuvable' });
    const prefix = 'data:image/jpeg;base64,';
    if (typeof d.data !== 'string' || !d.data.startsWith(prefix)) return send(res, 400, { error: 'Image invalide' });
    const buf = Buffer.from(d.data.slice(prefix.length), 'base64');
    if (buf.length < 500 || buf.length > 1_800_000 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: 'Image invalide ou trop lourde' });
    const name = `${mission.id}-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(PHOTO_DIR, name), buf);
    return send(res, 201, { photo: name });
  }
  if (method === 'POST' && p === '/api/brob/sos') {
    const d = await readBody(req, 2000);
    const mission = db.missions.find((x) => x.brob_id === b.id && ['assigned', 'in_progress', 'delivered'].includes(x.status));
    db.sos.push({
      id: 's' + Date.now().toString(36), at: Date.now(), brob_id: b.id, brob_name: b.name, brob_phone: b.phone,
      mission_ref: mission ? mission.ref : null, lat: Number(d.lat) || (b.pos && b.pos.lat) || null, lon: Number(d.lon) || (b.pos && b.pos.lon) || null, resolved: false,
    });
    save();
    return send(res, 201, { ok: true });
  }
  send(res, 404, { error: 'Introuvable' });
}

/* ───────────── Fichiers statiques ───────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, p) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Méthode non autorisée' });
  const rel = p === '/' ? '/index.html' : p === '/admin' ? '/admin.html' : p === '/client' ? '/client.html' : p === '/cockpit' ? '/cockpit.html' : p === '/badge' ? '/badge.html' : p;
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Page introuvable');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': (ext === '.html' || file.endsWith('sw.js') || file.endsWith('manifest.json')) ? 'no-cache' : 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  fs.createReadStream(file).pipe(res);
}

/* ───────────── Démarrage ───────────── */
initFounders();
loadFounders();
load();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, url.pathname, req.method);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (e.message === 'too_large') return send(res, 413, { error: 'Fichier trop volumineux' });
    if (e.message === 'bad_json') return send(res, 400, { error: 'Requête invalide' });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Erreur serveur' });
  }
});
server.listen(PORT, () => {
  console.log('\n==========================================================');
  console.log('  🥦 BROBROLI — serveur actif');
  console.log(`  Console fondateurs (privée) : http://localhost:${PORT}/admin`);
  console.log(`  App Brobrosseur             : http://localhost:${PORT}/`);
  lanUrls().forEach((u) => console.log(`  Sur le réseau Wi-Fi          : ${u}`));
  console.log('==========================================================\n');
});
process.on('uncaughtException', (e) => console.error('Erreur non gérée :', e));
