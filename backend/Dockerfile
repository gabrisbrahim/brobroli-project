# Dockerfile pour Brobroli (Node.js sans dépendances externes)
FROM node:20-alpine

WORKDIR /app

# Copie des fichiers source
COPY . .

# Port d'écoute par défaut
ENV PORT=5000
EXPOSE 5000

# Démarrage direct du serveur Brobroli
CMD ["node", "server.js"]
