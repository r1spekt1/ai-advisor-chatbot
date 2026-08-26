FROM node:26-bookworm-slim
WORKDIR /app

# toolchain za kompajliranje better-sqlite3
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/libg/apt/lists/*

# zavisnosti prvo - ovaj sloj se kesira dok se lockfile ne promijeni
COPY package.json package-lock.json ./
RUN npm ci --foreground-scripts

#fail fast: pukni ovdje ako native modul nije izbuildovan
RUN node -e "const D=require('better-sqlite3'); new D(':memory:').prepare('select 1').get(); console.log('sqlite ok')"

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && npm start"]
