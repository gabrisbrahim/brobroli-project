// database.js - Initialisation de la base de données SQLite pour Brobroli
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'brobroli.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur ouverture base de données:', err.message);
  } else {
    console.log('Connexion réussie à la base SQLite Brobroli.');
  }
});

// Création des tables
db.serialize(() => {
  // 1. Table Utilisateurs (Clients et Brobrosseurs)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('client', 'brobrosseur', 'admin')) NOT NULL,
      commune TEXT NOT NULL,
      rating REAL DEFAULT 5.0,
      missions_completed INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      badge_level TEXT DEFAULT 'Débutant',
      cni_number TEXT,
      wallet_balance INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Table Missions
  db.run(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      brobrosseur_id TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      commune TEXT NOT NULL,
      address_details TEXT NOT NULL,
      budget INTEGER NOT NULL,
      commission INTEGER NOT NULL,
      escrow_fee INTEGER DEFAULT 250,
      status TEXT CHECK(status IN ('published', 'accepted', 'in_progress', 'completed', 'cancelled')) DEFAULT 'published',
      payment_method TEXT DEFAULT 'orange_money',
      escrow_status TEXT CHECK(escrow_status IN ('pending', 'held', 'released', 'refunded')) DEFAULT 'pending',
      rating_client INTEGER,
      rating_brobrosseur INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES users(id),
      FOREIGN KEY(brobrosseur_id) REFERENCES users(id)
    )
  `);

  // 3. Table Messages de Chat
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES missions(id),
      FOREIGN KEY(sender_id) REFERENCES users(id)
    )
  `);

  console.log('Tables SQLite Brobroli initialisées avec succès.');
});

module.exports = db;
