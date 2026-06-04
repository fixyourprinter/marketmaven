FROM node:20

# Install build dependencies for native modules like sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Force build from source for native modules to avoid GLIBC issues
RUN npm install --build-from-source

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
