# Authentication System

## Overview

Simple authentication system for the Personal Dashboard application. This implementation provides basic login functionality without registration, OAuth, or complex features.

## Features

- **Login page** at `/login`
- **Session management** using httpOnly cookies
- **Route protection** via Next.js middleware
- **Password hashing** using bcryptjs
- **Logout functionality** in the sidebar
- **Admin panel** for viewing users at `/dashboard/users`

## What's NOT included (by design)

- No user registration (users are seeded manually)
- No password reset functionality
- No email verification
- No OAuth integration
- No complex role-based permissions
- No NextAuth.js (simple custom implementation)

## Database Schema

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  displayName  String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

## Default Users

After running the seed script, the following users are available:

| Username | Password   | Display Name |
|----------|------------|--------------|
| Pawel_F  | changeme   | Paweł F      |
| Kamil_S  | changeme   | Kamil S      |

**Important:** Change these passwords in production!

## Setup Instructions

### 1. Run Database Migration

```bash
npx prisma migrate dev --name add_user_model
npx prisma generate
```

### 2. Seed the Database

```bash
npm run seed
```

This creates the default users with hashed passwords.

### 3. Start the Application

```bash
npm run dev    # Development
npm run build  # Build for production
npm run start  # Start production server
```

## File Structure

### New Files Created

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx          # Login page
├── (dashboard)/
│   └── dashboard/
│       └── users/
│           └── page.tsx      # Admin users list (real data from DB)
└── api/
    ├── auth/
    │   ├── login/
    │   │   └── route.ts      # Login API
    │   ├── logout/
    │   │   └── route.ts      # Logout API
    │   └── session/
    │       └── route.ts      # Session check API
    └── admin/
        └── users/
            └── route.ts      # Get all users API

components/
└── ui/
    └── alert.tsx             # Alert component for login errors

prisma/
├── seed.js                   # Database seed script
└── migrations/
    └── 20260605224539_add_user_model/
        └── migration.sql

middleware.ts                 # Route protection middleware
```

### Modified Files

- `prisma/schema.prisma` - Added User model
- `package.json` - Added seed script and dependencies
- `components/shared/sidebar.tsx` - Added Admin section with Users, Logout button, and scroll support

## How It Works

### Login Flow

1. User visits `/login` (public route)
2. Enters username and password
3. Form submits to `/api/auth/login`
4. API verifies credentials against database
5. On success: sets httpOnly cookie and redirects to `/dashboard`
6. On failure: shows generic error message

### Route Protection

The middleware (`middleware.ts`) intercepts all requests:

- **Public routes:** `/login`, `/api/auth/*`
- **Static files:** `/_next/*`, `/assets/*`, `/favicon.ico`
- **Protected routes:** All other routes require a valid session cookie

Unauthenticated users are redirected to `/login` with a callback URL.

### Session Management

- Sessions are stored as httpOnly cookies
- Cookie format: `userId:timestamp`
- Session duration: 7 days
- Cookie is deleted on logout

### Logout Flow

1. User clicks "Wyloguj" button in sidebar
2. Calls `/api/auth/logout` (POST)
3. API deletes the session cookie
4. User is redirected to `/login`

## Security Considerations

### Implemented

- Passwords are hashed with bcryptjs (salt rounds: 10)
- Session cookies are httpOnly (not accessible via JavaScript)
- Session cookies are secure in production (HTTPS only)
- Generic error messages (don't reveal if user exists)
- Inactive users cannot log in

### Recommendations for Production

1. Use HTTPS in production
2. Implement rate limiting on login endpoint
3. Consider using JWT tokens for scalability
4. Add CSRF protection
5. Implement password complexity requirements
6. Add account lockout after failed attempts
7. Use environment variables for sensitive configuration

## API Reference

### POST /api/auth/login

**Request Body:**
```json
{
  "username": "Pawel_F",
  "password": "changeme"
}
```

**Note:** The username field accepts either username or email. The login form has `noValidate` to prevent browser validation issues.

**Success Response (200):**
```json
{
  "user": {
    "id": "...",
    "username": "Pawel_F",
    "displayName": "Paweł F"
  }
}
```

**Error Response (401):**
```json
{
  "error": "Błędne dane logowania"
}
```

### POST /api/auth/logout

**Response (200):**
```json
{
  "success": true
}
```

### GET /api/auth/session

**Response (200):**
```json
{
  "user": {
    "id": "...",
    "username": "Pawel_F",
    "displayName": "Paweł F",
    "isActive": true
  }
}
```

Or if not authenticated:
```json
{
  "user": null
}
```

### GET /api/admin/users

Returns list of all users (requires authentication).

**Response (200):**
```json
[
  {
    "id": "...",
    "username": "Pawel_F",
    "displayName": "Paweł F",
    "isActive": true,
    "createdAt": "2026-06-05T22:00:00.000Z",
    "updatedAt": "2026-06-05T22:00:00.000Z"
  }
]
```

## Testing Checklist

- [ ] `/login` is accessible without authentication
- [ ] Login with `Pawel_F / changeme` works
- [ ] Login with `Kamil_S / changeme` works
- [ ] Wrong password shows error message
- [ ] After login, redirected to `/dashboard`
- [ ] Protected routes redirect to `/login` when not authenticated
- [ ] Logout button works and redirects to `/login`
- [ ] `/admin/users` shows the user list
- [ ] Build completes successfully