FROM node:18-slim

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

# Copy the rest of the application
COPY . .

# Start the MCP server
CMD ["node", "index.js"] 