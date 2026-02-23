FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache git openssh
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build
CMD ["npm", "start"]
