# Use a small Node image
FROM node:18-alpine

# Create app directory
WORKDIR /app/backend

# Copy package files first (for caching npm install)
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the backend code
COPY backend ./

# Expose the port your backend listens on
EXPOSE 4000

# Start command (يعتمد على package.json في backend)
CMD ["npm", "start"]
