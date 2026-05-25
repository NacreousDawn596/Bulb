# Undead Bot Configuration

## Required Secrets

### Discord
- `BOT_TOKEN`: Your Discord Bot Token
- `CLIENT_ID`: Your Discord Application Client ID
- `GUILD_ID`: (Optional) For fast command registration

### Cloudflare R2
- `R2_ENDPOINT`: S3 endpoint (e.g., https://<id>.r2.cloudflarestorage.com)
- `R2_ACCESS_KEY_ID`: R2 Access Key
- `R2_SECRET_ACCESS_KEY`: R2 Secret Key
- `R2_BUCKET`: R2 Bucket Name

### Cloudflare D1
- `D1_DATABASE_ID`: Cloudflare D1 Database ID
- `D1_API_TOKEN`: Cloudflare API Token (with D1 edit permissions)
- `D1_ACCOUNT_ID`: Cloudflare Account ID

### GitHub
- `GITHUB_PAT`: Personal Access Token (with workflow permission)
- `GITHUB_OWNER`: GitHub Username/Org
- `GITHUB_REPO`: Repository Name
- `GITHUB_WORKFLOW`: Workflow filename (e.g., bot.yml)

### Reviver
- `REVIVER_SECRET`: Shared secret between bot and reviver
- `REVIVER_URL`: URL of the Fly.io reviver service
