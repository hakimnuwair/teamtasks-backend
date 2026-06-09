# TeamTasks — Backend API

REST API and real-time server for the TeamTasks productivity platform. Built with Node.js, Express 5, MongoDB, and Socket.io. Handles authentication, task management, group operations, real-time notifications, and scheduled reminders.

**Frontend Repo →** [teamtasks-application](https://github.com/hakimnuwair/teamtasks-application)

---

## Why TeamTasks?

Most team collaboration tools are either too heavy (Jira, Asana) or too simple (shared to-do lists with no real access control). TeamTasks sits in the middle — a focused productivity backend purpose-built for small teams that need role-based task management, real-time updates, and deadline reminders without the enterprise overhead.

This API powers everything: authentication with Google OAuth, group and invitation management, Socket.io-driven live notifications, and cron-based reminders so no deadline ever goes unnoticed.

---

## What does this backend power?

Most team productivity tools either lack real-time feedback or require heavyweight infrastructure to set it up. This API is built to be lean, secure, and event-driven from the ground up.

**The core problems it solves:**

- **Auth complexity** — handles JWT access + refresh token rotation, Google OAuth via Passport.js, and role-based access (Admin / Manager / Member) so the frontend never manages permissions logic itself.
- **Real-time delivery** — Socket.io is integrated at the server level, pushing notifications, deadline alerts, and activity events instantly without polling.
- **Automated deadline tracking** — `node-cron` runs scheduled jobs to check upcoming deadlines and fire reminder notifications automatically, even when users aren't in the app.
- **Clean, safe API contract** — every endpoint is Zod-validated, rate-limited, and returns consistent responses, making frontend integration straightforward and predictable.

This repo is the Node.js / Express backend — the frontend lives in [teamtasks-application](https://github.com/hakimnuwair/teamtasks-application).

---

## Tech Stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Runtime    | Node.js (ESM)                      |
| Framework  | Express 5                          |
| Database   | MongoDB + Mongoose                 |
| Real-time  | Socket.io                          |
| Auth       | JWT (Access + Refresh Tokens)      |
| OAuth      | Passport.js + Google OAuth 2.0     |
| Validation | Zod                                |
| Email      | Nodemailer                         |
| Scheduling | node-cron                          |
| Security   | Helmet, express-rate-limit, bcrypt |

---

## Features

- **JWT Authentication** — access + refresh token flow with secure cookie handling
- **Google OAuth 2.0** — sign in with Google via Passport.js
- **Role-Based Access Control** — Admin, Manager, and Member roles with protected routes
- **Group Management** — create groups, manage members, invitation system
- **Real-time Events** — Socket.io for instant notifications and deadline alerts
- **Scheduled Reminders** — cron jobs for deadline and reminder notifications
- **Email Notifications** — Nodemailer for invitation and alert emails
- **Rate Limiting** — per-route request throttling
- **Input Validation** — request body validation using Zod schemas

---

## API Routes

| Method | Endpoint                    | Access | Description                |
| ------ | --------------------------- | ------ | -------------------------- |
| POST   | `/api/v1/auth/register`     | Public | Register a new user        |
| POST   | `/api/v1/auth/login`        | Public | Login and receive tokens   |
| POST   | `/api/v1/auth/refresh`      | Public | Refresh access token       |
| POST   | `/api/v1/auth/logout`       | Auth   | Logout and clear tokens    |
| GET    | `/api/v1/auth/google`       | Public | Google OAuth redirect      |
| GET    | `/api/v1/users`             | Auth   | Get user profile           |
| PUT    | `/api/v1/users`             | Auth   | Update profile             |
| GET    | `/api/v1/groups`            | Auth   | List user's groups         |
| POST   | `/api/v1/groups`            | Auth   | Create a group             |
| POST   | `/api/v1/invitations`       | Auth   | Send group invitation      |
| PATCH  | `/api/v1/invitations/:id`   | Auth   | Accept / reject invitation |
| GET    | `/api/v1/notifications`     | Auth   | Get notifications          |
| PATCH  | `/api/v1/notifications/:id` | Auth   | Mark notification as read  |
| GET    | `/api/v1/reminders`         | Auth   | Get user reminders         |
| POST   | `/api/v1/reminders`         | Auth   | Create a reminder          |
| DELETE | `/api/v1/reminders/:id`     | Auth   | Delete a reminder          |
| GET    | `/api/v1/activity`          | Auth   | Get activity log           |

---

## Project Structure

```
src/
├── config/         # DB connection, passport config
├── controllers/    # Route handler logic
├── middlewares/    # Auth, error handling, rate limiting
├── models/         # Mongoose schemas (User, Group, Notification, etc.)
├── routes/         # Express route definitions
├── schema/         # Zod validation schemas
├── services/       # Business logic, email, socket events
├── utils/          # Helper functions
├── validators/     # Request validators
├── seedAdmin.js    # Admin seed script
└── app.js          # App entry point
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB Atlas account (or local MongoDB)

### Installation

```bash
# Clone the repo
git clone https://github.com/hakimnuwair/teamtasks-backend.git
cd teamtasks-backend

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PORT=5001
MONGO_URI=your_mongodb_connection_string

versionPrefix=/api/v1

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5001/api/v1/auth/google/callback

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

CLIENT_URL=http://localhost:5173
```

### Running Locally

```bash
# Development (with hot-reload)
npm run dev

# Production
npm start
```

The server will start on `http://localhost:5001`.

### Seed Admin User

```bash
node src/seedAdmin.js
```

---

## Scripts

| Command       | Description                |
| ------------- | -------------------------- |
| `npm run dev` | Start server with nodemon  |
| `npm start`   | Start server in production |

---

## Deployment

This project is deployed on **Render** (or your preferred Node.js host) with CI/CD from the develop branch.

> **Note:** Ensure all environment variables are configured in your deployment platform before going live.

---

## Related Repositories

- **Frontend App** — [teamtasks-application](https://github.com/hakimnuwair/teamtasks-application) (React / TypeScript / Tailwind CSS)

---

## Author

**Nuwair Hakim** — Full-Stack Developer

[LinkedIn](https://linkedin.com/in/hakimnuwair) · [GitHub](https://github.com/hakimnuwair) · [Portfolio](https://nuwairportfolio.vercel.app)
