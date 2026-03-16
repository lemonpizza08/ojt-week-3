# OJT Task Tracker

A full-stack task management application built with React and Node.js, featuring Google Drive file uploads, Google Calendar integration, email deadline reminders, and data visualization.

## Tech Stack

- **Frontend:** React 19, Chart.js, jsPDF, XLSX
- **Backend:** Express 5, PostgreSQL, JWT Authentication
- **Integrations:** Google Drive API, Google Calendar API, Gmail (Nodemailer)

## Project Structure

```
ojtweek2/
├── client/                  # React frontend
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── features/        # Feature-specific components
│       ├── hooks/           # Custom React hooks
│       ├── services/        # API communication
│       └── utils/           # Helper functions
├── server/                  # Express backend
│   ├── config/              # DB, Google OAuth, env validation
│   ├── controllers/         # HTTP request handling
│   ├── middlewares/         # Auth, upload, rate limiting, errors
│   ├── repositories/        # Database queries (data access layer)
│   ├── routes/              # API route definitions
│   ├── services/            # External service integrations
│   ├── utils/               # Scheduler and helpers
│   └── validators/          # Input validation rules
└── schema.sql               # Database schema
```

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd ojtweek2

cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

```bash
cp .env.example server/.env
```

Edit `server/.env` with your credentials (see `.env.example` for required variables).

### 3. Set up the database

Create a PostgreSQL database and run the schema:

```bash
psql -U your_user -d your_database -f schema.sql
```

### 4. Run the application

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm start
```

The server runs on `http://localhost:5000` and the client on `http://localhost:3000`.

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/activities` | Yes | List user's tasks (paginated) |
| POST | `/api/activities` | Yes | Create task (with file upload) |
| PUT | `/api/activities/:id` | Yes | Update task |
| DELETE | `/api/activities/:id` | Yes | Delete task |
| GET | `/api/activities/stats` | Yes | Task frequency stats for charts |
| GET | `/health` | No | Health check |

## Features

- JWT-based authentication with rate limiting
- CRUD operations with input validation
- File uploads to Google Drive (10MB limit, restricted file types)
- Deadline syncing with Google Calendar
- Automated email reminders (24h before + at deadline)
- Bar chart data visualization
- PDF and Excel report generation
