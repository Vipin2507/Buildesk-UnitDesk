# UnitDesk production notes

## Domain
- https://unitdesk.cravingcodetech.in
- Server: 69.62.84.237

## CloudPanel site
1. Sites → **+ ADD SITE**
2. Domain: `unitdesk.cravingcodetech.in`
3. App type: **NODEJS**
4. Note the created **Site User** (e.g. `unitdesk`)
5. Point the Node app to this project folder and start with `npm start`
6. App port must match `.env` `PORT` (default `3001`) and CloudPanel’s Node port setting

## Server bootstrap (one-time, as site user)
```bash
cd /home/<SITE_USER>/htdocs/unitdesk.cravingcodetech.in
# or whatever path CloudPanel shows for the site
git clone https://github.com/Vipin2507/Buildesk-UnitDesk.git .
cp .env.example .env
nano .env   # set JWT_SECRET + DATABASE_URL + PORT
npm ci
npx prisma generate
npx prisma db push
npm run db:seed
npm run build
pm2 start npm --name unitdesk -- start
pm2 save
```

## GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions:

| Secret | Example |
| --- | --- |
| `SSH_HOST` | `69.62.84.237` |
| `SSH_USER` | CloudPanel site user |
| `SSH_PRIVATE_KEY` | Private key for that user (full PEM) |
| `SSH_PORT` | `22` (optional) |
| `DEPLOY_PATH` | `/home/<SITE_USER>/htdocs/unitdesk.cravingcodetech.in` |

Deploy runs on every push to `main`.
