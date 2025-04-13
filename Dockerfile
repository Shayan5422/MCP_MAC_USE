FROM node:18-slim AS builder

# Install dependencies required by robotjs for compilation
RUN apt-get update && apt-get install -y \
    libxtst-dev \
    libpng-dev \
    build-essential \
    python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Use a smaller image for the runtime
FROM node:18-slim

# Install only runtime dependencies needed for libxtst (X11)
RUN apt-get update && apt-get install -y \
    libxtst6 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the application code
COPY . .

# Start the MCP server
CMD ["node", "index.js"] 