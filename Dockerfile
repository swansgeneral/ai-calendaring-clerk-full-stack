# Use Node.js 20
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy files and install EVERYTHING (including devDependencies like Vite)
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# IMPORTANT: Build the frontend (creates the /dist folder)
RUN npm run build

# Tell the app it is in PRODUCTION mode
ENV NODE_ENV=production

# Tell the app to use port 8080 (Cloud Run's favorite)
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
