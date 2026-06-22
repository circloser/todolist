# GitHub and Cloudflare Deployment

## 1. GitHub Upload

If Git is not installed yet:

```powershell
winget install --id Git.Git --source winget
```

Then open a new PowerShell window and run:

```powershell
cd C:\Users\user\Documents\Codex\2026-06-22\sites-plugin-sites-openai-bundled-to\work\team-progress-site
git init
git add .
git commit -m "Initial team progress checklist"
git branch -M main
git remote add origin https://github.com/circloser/todolist.git
git push -u origin main
```

## 2. Create Cloudflare D1

```powershell
npm.cmd run cf:d1:create
```

Save the `database_id` shown by Wrangler.

## 3. Deploy from Local PowerShell

```powershell
$env:CLOUDFLARE_D1_DATABASE_ID="your_database_id"
npm.cmd run deploy
```

Wrangler may open a browser window for Cloudflare login on the first deploy.

## 4. Deploy with GitHub Actions

In GitHub, open the repository, then go to Settings > Secrets and variables > Actions.

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`

Optional repository variables:

- `CLOUDFLARE_D1_DATABASE_NAME`: default `team-progress-checklist-db`
- `CLOUDFLARE_WORKER_NAME`: default `team-progress-checklist`

After that, every push to `main` will run `.github/workflows/deploy-cloudflare.yml`.
