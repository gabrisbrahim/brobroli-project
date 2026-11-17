// native_server.js - Serveur API Brobroli avec Géolocalisation & Attribution par Rayon (Haversine)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 5000;
const DB_FILE = path.join(__dirname, 'brobroli_data.json');

// Coordonnées de référence des communes d'Abidjan pour calcul automatique
const ABIDJAN_COORDS = {
  'Cocody': { lat: 5.3599, lon: -3.9858 },
  'Marcory': { lat: 5.3045, lon: -3.9880 },
  'Yopougon': { lat: 5.3421, lon: -4.0742 },
  'Plateau': { lat: 5.3238, lon: -4.0197 },
  'Koumassi': { lat: 5.2974, lon: -3.9571 },
  'Abobo': { lat: 5.4162, lon: -4.0198 },
  'Treichville': { lat: 5.3028, lon: -4.0118 }
};

// Formule de Haversine pour calculer la distance exacte en km entre deux points GPS
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10; // Arrondi à 1 décimale
}

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [
        {
          id: 'user-client-1',
          phone: '0707070701',
          full_name: 'Gabriel (Client)',
          role: 'client',
          commune: 'Cocody',
          lat: 5.3610,
          lon: -3.9840,
          rating: 5.0,
          missions_completed: 4,
          is_verified: 1,
          badge_level: 'Client Régulier',
          wallet_balance: 0
        },
        {
          id: 'user-brob-1',
          phone: '0707070702',
          full_name: 'Aminata Koné',
          role: 'brobrosseur',
          commune: 'Cocody',
          lat: 5.3585,
          lon: -3.9870, // ~0.4 km de Gabriel
          rating: 4.9,
          missions_completed: 127,
          is_verified: 1,
          badge_level: 'Expert',
          wallet_balance: 38500
        },
        {
          id: 'user-brob-2',
          phone: '0707070703',
          full_name: 'Kouadio Serge',
          role: 'brobrosseur',
          commune: 'Cocody',
          lat: 5.3490,
          lon: -3.9780, // ~1.5 km
          rating: 4.8,
          missions_completed: 98,
          is_verified: 1,
          badge_level: 'Confirmé',
          wallet_balance: 14000
        },
        {
          id: 'user-brob-3',
          phone: '0707070704',
          full_name: 'Ibrahim Touré',
          role: 'brobrosseur',
          commune: 'Yopougon',
          lat: 5.3421,
          lon: -4.0742, // ~10 km (hors rayon Cocody)
          rating: 4.5,
          missions_completed: 12,
          is_verified: 1,
          badge_level: 'Débutant',
          wallet_balance: 5000
        }
      ],
      missions: [
        {
          id: 'mission-1',
          client_id: 'user-client-1',
          client_name: 'Gabriel (Client)',
          client_phone: '0707070701',
          brobrosseur_id: 'user-brob-1',
          brobrosseur_name: 'Aminata Koné',
          category: 'Courses',
          title: 'Courses fraîches au marché de Cocody',
          description: 'Acheter légumes pour sauce graine (tomates, gombo, piment, aubergines locales).',
          commune: 'Cocody',
          lat: 5.3610,
          lon: -3.9840,
          address_details: 'Angré 8ème tranche, après la pharmacie',
          budget: 3500,
          commission: 420,
          escrow_fee: 250,
          status: 'in_progress',
          payment_method: 'orange_money',
          escrow_status: 'held',
          created_at: new Date().toISOString()
        },
        {
          id: 'mission-2',
          client_id: 'user-client-1',
          client_name: 'Gabriel (Client)',
          client_phone: '0707070701',
          brobrosseur_id: null,
          brobrosseur_name: null,
          category: 'Ménage',
          title: 'Nettoyage 3 pièces et repassage',
          description: 'Nettoyage salon, cuisine, terrasse et repassage de 10 chemises.',
          commune: 'Cocody',
          lat: 5.3650,
          lon: -3.9810,
          address_details: 'Riviera Palmeraie',
          budget: 7000,
          commission: 840,
          escrow_fee: 250,
          status: 'published',
          payment_method: 'wave',
          escrow_status: 'held',
          created_at: new Date().toISOString()
        }
      ],
      messages: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

initDB();

function getDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function setHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

const server = http.createServer((req, res) => {
  setHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ROUTE DE SANTÉ
  if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'online',
      project: 'Brobroli Geolocation & Dispatch Engine',
      market: 'Abidjan, Côte d\'Ivoire',
      supported_communes: Object.keys(ABIDJAN_COORDS)
    }));
    return;
  }

  // MISE A JOUR POSITION GPS BROBROSSEUR : POST /api/users/:id/location
  if (req.method === 'POST' && pathname.startsWith('/api/users/') && pathname.endsWith('/location')) {
    const userId = pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const db = getDB();
        const user = db.users.find(u => u.id === userId);
        if (!user) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Utilisateur introuvable' }));
          return;
        }

        user.lat = parseFloat(payload.lat);
        user.lon = parseFloat(payload.lon);
        if (payload.commune) user.commune = payload.commune;

        saveDB(db);
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Position GPS actualisée', user_id: userId, lat: user.lat, lon: user.lon }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Payload invalide' }));
      }
    });
    return;
  }

  // ALGORITHME D'ATTRIBUTION PAR RAYON (DISPATCH) : GET /api/missions/nearby
  // Paramètres : lat, lon, max_distance_km (défaut : 2.5 km)
  if (req.method === 'GET' && pathname === '/api/missions/nearby') {
    const db = getDB();
    const lat = parseFloat(url.searchParams.get('lat') || '5.3599');
    const lon = parseFloat(url.searchParams.get('lon') || '-3.9858');
    const maxDist = parseFloat(url.searchParams.get('radius_km') || '3.0'); // Rayon max en km

    // Filtrer les missions ouvertes et calculer la distance exacte
    const nearby = db.missions
      .filter(m => m.status === 'published')
      .map(m => {
        const dist = calculateDistanceKm(lat, lon, m.lat || 5.3599, m.lon || -3.9858);
        return {
          ...m,
          distance_km: dist,
          is_walkable: dist <= 1.2 // Accessible à pied sans transport payant
        };
      })
      .filter(m => m.distance_km <= maxDist)
      .sort((a, b) => a.distance_km - b.distance_km);

    res.writeHead(200);
    res.end(JSON.stringify({
      search_center: { lat, lon },
      radius_km: maxDist,
      total_matches: nearby.length,
      missions: nearby
    }));
    return;
  }

  // LISTE GLOBALE MISSIONS : GET /api/missions
  if (req.method === 'GET' && pathname === '/api/missions') {
    const db = getDB();
    res.writeHead(200);
    res.end(JSON.stringify(db.missions));
    return;
  }

  // PUBLIER UNE NOUVELLE MISSION : POST /api/missions
  if (req.method === 'POST' && pathname === '/api/missions') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const db = getDB();
        const client = db.users.find(u => u.id === payload.client_id) || db.users[0];

        const commune = payload.commune || 'Cocody';
        const defaultCoords = ABIDJAN_COORDS[commune] || ABIDJAN_COORDS['Cocody'];

        const budget = parseInt(payload.budget || 3500, 10);
        const commission = Math.round(budget * 0.12);

        const newMission = {
          id: 'mission-' + crypto.randomUUID(),
          client_id: client.id,
          client_name: client.full_name,
          client_phone: client.phone,
          brobrosseur_id: null,
          brobrosseur_name: null,
          category: payload.category || 'Courses',
          title: payload.title || 'Mission Brobroli',
          description: payload.description || '',
          commune: commune,
          lat: payload.lat ? parseFloat(payload.lat) : defaultCoords.lat,
          lon: payload.lon ? parseFloat(payload.lon) : defaultCoords.lon,
          address_details: payload.address_details || '',
          budget: budget,
          commission: commission,
          escrow_fee: 250,
          status: 'published',
          payment_method: payload.payment_method || 'orange_money',
          escrow_status: 'held',
          created_at: new Date().toISOString()
        };

        db.missions.unshift(newMission);
        saveDB(db);

        // Trouver immédiatement les Brobrosseurs qualifiés dans le rayon
        const matchedBrobrosseurs = db.users
          .filter(u => u.role === 'brobrosseur' && u.is_verified === 1)
          .map(u => ({
            id: u.id,
            name: u.full_name,
            phone: u.phone,
            rating: u.rating,
            distance_km: calculateDistanceKm(newMission.lat, newMission.lon, u.lat || defaultCoords.lat, u.lon || defaultCoords.lon)
          }))
          .filter(u => u.distance_km <= 3.0)
          .sort((a, b) => a.distance_km - b.distance_km);

        res.writeHead(201);
        res.end(JSON.stringify({
          message: 'Mission créée avec succès et géolocalisée.',
          mission: newMission,
          notified_brobrosseurs: matchedBrobrosseurs
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Erreur création mission' }));
      }
    });
    return;
  }

  // ACCEPTER UNE MISSION : POST /api/missions/:id/accept
  if (req.method === 'POST' && pathname.startsWith('/api/missions/') && pathname.endsWith('/accept')) {
    const missionId = pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const db = getDB();
        const mission = db.missions.find(m => m.id === missionId);
        const brob = db.users.find(u => u.id === payload.brobrosseur_id);

        if (!mission) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Mission introuvable' }));
          return;
        }

        mission.brobrosseur_id = brob ? brob.id : 'user-brob-1';
        mission.brobrosseur_name = brob ? brob.full_name : 'Aminata Koné';
        mission.status = 'in_progress';

        saveDB(db);
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Mission attribuée au Brobrosseur avec succès !', mission }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Erreur acceptation' }));
      }
    });
    return;
  }

  // CLÔTURER & LIBÉRER SÉQUESTRE : POST /api/missions/:id/complete
  if (req.method === 'POST' && pathname.startsWith('/api/missions/') && pathname.endsWith('/complete')) {
    const missionId = pathname.split('/')[3];
    const db = getDB();
    const mission = db.missions.find(m => m.id === missionId);

    if (!mission) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Mission introuvable' }));
      return;
    }

    mission.status = 'completed';
    mission.escrow_status = 'released';

    const netGain = mission.budget - mission.commission;
    const brob = db.users.find(u => u.id === mission.brobrosseur_id);
    if (brob) {
      brob.wallet_balance += netGain;
      brob.missions_completed += 1;
    }

    saveDB(db);
    res.writeHead(200);
    res.end(JSON.stringify({
      message: 'Mission terminée avec succès. Fonds libérés vers le Brobrosseur.',
      net_paid: netGain
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Route introuvable' }));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🥦 MOTEUR DE GÉOLOCALISATION & DISPATCH BROBROLI ACTIF (Port ${PORT})`);
  console.log(`📍 Calcul de proximité Haversine actif sur les communes d'Abidjan`);
  console.log(`=======================================================`);
});
