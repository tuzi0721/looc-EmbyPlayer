FROM node:22-alpine

WORKDIR /app

# Install all deps (tsx runs the TS sources directly at runtime).
COPY package.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
