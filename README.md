# Project Setup

This repository contains one backend app and one frontend app:

- `backend/` - Express API, SQLite database, LLM/document services
- `frontend/` - React/Vite UI

## Getting Started

From the repository root:

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
```

The backend runs on port 4000 by default. The frontend dev server proxies `/api` requests to the backend.

### Backend Only

```bash
cd backend
npm install
npm run start
```

### Frontend Only

```bash
cd frontend
npm install
npm run dev
```

## Authentication

The application now includes a complete authentication system:

### Features

- **User Registration**: Users can register with:
  - Full Name (required)
  - Email (required, unique)
  - User ID (required, unique)
  - Password (required, minimum 6 characters)
  - Phone Number (optional)
  - Age (optional)

- **User Login**: Users can login using their User ID and Password

- **Session Management**: Sessions are managed server-side using express-session

- **Protected Routes**: All project-related routes require authentication

- **User-Specific Projects**: Each user's projects are stored separately and only accessible to them

### Usage

1. **First Time Users**: Navigate to `/auth` and click "Register" to create an account
2. **Existing Users**: Navigate to `/auth` and login with your User ID and Password
3. **After Login**: You'll be redirected to the projects dashboard where you can manage your projects
4. **Logout**: Click the logout button in the top-right corner of the dashboard

### Database

User data and projects are stored in SQLite database (`backend/data/db.sqlite`). The database includes:
- `users` table: Stores user credentials and profile information
- `projects` table: Stores user-specific projects (linked via `user_id`)

### API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with user ID and password
- `POST /api/auth/logout` - Logout current user
- `GET /api/auth/me` - Get current user information
- `GET /api/projects` - Get all projects for current user
- `POST /api/project` - Create a new project
- `GET /api/project/:id` - Get project details
- `DELETE /api/project/:id` - Delete a project
