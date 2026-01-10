# Backend Build Server with Emscripten
# Uses emscripten/emsdk for WASM compilation support

FROM emscripten/emsdk:latest

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY server.js queue.js worker.js reload.js ./
COPY game/ ./game/
COPY gfx/ ./gfx/

# Create builds directory
RUN mkdir -p builds

# Expose ports
# 3001 - Express API
# 8081 - Hot-reload WebSocket
# 1234 - Game WebSocket
EXPOSE 3001 8081 1234

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
