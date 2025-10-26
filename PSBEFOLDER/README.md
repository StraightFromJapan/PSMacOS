# Psychological Studio License Backend

Backend API for license authentication and hardware binding.

## Endpoints

- `GET /health` - Health check
- `POST /api/register` - Create new license (admin only)
- `POST /api/login` - Login with username/password
- `POST /api/activate-license` - Activate license with hardware ID
- `POST /api/verify-session` - Verify session token
- `POST /api/logout` - End session
- `GET /api/user/:username` - Get user info

## Deploy to Render

1. Push this repo to GitHub
2. Create new Web Service on Render
3. Connect to your GitHub repo
4. Set environment:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add persistent disk at `/app/data` (optional, for database persistence)

## Local Development

```bash
npm install
npm start
```

Server runs on http://localhost:10000
