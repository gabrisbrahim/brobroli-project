# 🥦 Brobroli

> **Plateforme de corvées & courses du quotidien à Abidjan (Côte d'Ivoire)**  
> Courses au grand marché · Ménage à domicile · Cuisine ivoirienne · Démarches express

---

## 📱 Les 3 Applications Intégrées

1. **🛍️ Application Client** (`/client`) : Sélection de prestations, commande vocale, tarification intelligente sur-mesure, paiement garanti sous séquestre (Wave / Orange Money) et suivi radar GPS en direct.
2. **🧑‍🔧 Application Brobrosseur** (`/`) : Espace des prestataires agréés, guidage pas-à-pas de la mission, téléversement des justificatifs / photos de tickets, et portefeuille de gains (88 % net reversés).
3. **👑 Console Fondateurs** (`/admin`) : Tableau de bord de supervision, validation des badges et certifications (CNI, Casier vierge, Expert marché), gestion de trésorerie et répartition 70/30.

---

## 🚀 Démarrage Rapide

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- **Aucune dépendance externe requise** (conçu avec l'API standard Node.js : `http`, `crypto`, `fs`, `path`).

### Lancement
```bash
# Démarrage du serveur
npm start
```

Le serveur démarre immédiatement sur le port `5000` :
- **Cockpit 3-en-1** : [http://localhost:5000/cockpit](http://localhost:5000/cockpit)
- **Application Client** : [http://localhost:5000/client](http://localhost:5000/client)
- **Espace Brobrosseur** : [http://localhost:5000/](http://localhost:5000/)
- **Console Fondateurs** : [http://localhost:5000/admin](http://localhost:5000/admin)

---

## 📁 Architecture du Projet

```
brobroli-project/
├── backend/
│   ├── server.js            # Moteur HTTP, API REST et WebSockets/polling
│   ├── data/                # Données de persistances JSON
│   └── public/              # Interfaces Web (Client, Brobrosseur, Admin, Cockpit)
├── mobile/                  # Prototype d'application mobile
├── package.json             # Configuration et scripts de déploiement
└── README.md                # Documentation officielle
```

---

## 📄 Licence & Droits
Tous droits réservés © 2026 Brobroli.
