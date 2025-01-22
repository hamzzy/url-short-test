# Use an official Node.js image as the base
FROM node:20

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 build-essential
# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies
RUN npm install 

# Copy the application source code
COPY . .

# Expose the port your app runs on (default NestJS port is 3000)
EXPOSE 3000

# Use nodemon for hot-reloading during development
CMD ["npm", "run", "start:dev"]