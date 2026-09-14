# UnitDesk — GitHub Actions deploy

## Live
- URL: https://unitdesk.cravingcodetech.in
- Server: `69.62.84.237`
- Path: `/home/unitdesk/htdocs/unitdesk.cravingcodetech.in`
- Port: `3101` (must match CloudPanel App Port + `.env` `PORT`)
- PM2 name: `unitdesk` (currently under **root**)

## GitHub secrets
Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | `69.62.84.237` |
| `SSH_USER` | `root` |
| `SSH_PRIVATE_KEY` | Full private key PEM used for root SSH |
| `SSH_PORT` | `22` |
| `DEPLOY_PATH` | `/home/unitdesk/htdocs/unitdesk.cravingcodetech.in` |

> Use `root` because PM2 was started as root. Later you can move the process to user `unitdesk` and switch `SSH_USER`.

## One-time SSH key (on your Mac)
```bash
ssh-keygen -t ed25519 -C "github-unitdesk-deploy" -f ~/.ssh/unitdesk_deploy -N ""
ssh-copy-id -i ~/.ssh/unitdesk_deploy.pub root@69.62.84.237
# test
ssh -i ~/.ssh/unitdesk_deploy root@69.62.84.237 'pm2 describe unitdesk | head'
```

Add **private** key to GitHub secret `SSH_PRIVATE_KEY`:
```bash
pbcopy < ~/.ssh/unitdesk_deploy
```

## Trigger deploy
- Push to `main`, or
- Actions → **Deploy UnitDesk** → **Run workflow**

## Server `.env` (already created; do not overwrite via Actions)
```env
DATABASE_URL="file:./prod.db"
JWT_SECRET="..."
PORT=3101
NODE_ENV=production
```
