FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install --prefix frontend
RUN npm install --prefix backend

EXPOSE 3000
EXPOSE 5000

CMD ["npm", "start"]