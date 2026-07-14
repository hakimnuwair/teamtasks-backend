# TeamTasks — Backend API

![Node.js](https://img.shields.io/badge/Node.js-ESM-339933)
![Express](https://img.shields.io/badge/Express-5-000000)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248)
![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101)
![Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2)

REST API and real-time server for **TeamTasks** — a collaborative task management platform. Built with Node.js, Express 5, MongoDB, and Socket.io. Handles authentication, group-based collaboration, task/sub-task management, AI-assisted planning, real-time updates, and scheduled deadline tracking.

**Frontend Repo →** [teamtasks-application](https://github.com/hakimnuwair/teamtasks-application)

---

## Table of Contents

- [Why TeamTasks?](#why-teamtasks)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Engineering Highlights](#engineering-highlights)
- [API Routes](#api-routes)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Related Repositories](#related-repositories)
- [Author](#author)

---

## Why TeamTasks?

Most team collaboration tools are either too heavy (Jira, Asana) or too simple (shared to-do lists with no real access control). TeamTasks sits in the middle — a focused productivity backend for small teams that need role-based task management, real-time updates, and deadline tracking, with an AI assist for breaking work down, all without the enterprise overhead.

This API powers authentication (JWT + Google OAuth), group and invitation management, task/sub-task hierarchies with fine-grained permissions, Gemini-backed AI planning, Socket.io-driven live updates, and cron-based overdue tracking.

---

## Tech Stack

| Layer            | Technology                              |
| ---------------- | ---------------------------------------- |
| Runtime          | Node.js (ESM)                            |
| Framework        | Express 5                                |
| Database         | MongoDB + Mongoose 9                     |
| Real-time        | Socket.io                                |
| Auth             | JWT (access + refresh tokens), bcrypt    |
| OAuth            | Passport.js + Google OAuth 2.0           |
| AI               | Google Gemini (`@google/genai`)          |
| Validation       | Zod                                      |
| Email            | Nodemailer                               |
| Scheduling       | node-cron                                |
| Security         | Helmet, express-rate-limit               |

---

## Key Features

- **JWT Authentication** — short-lived access tokens + httpOnly-cookie refresh tokens, with transparent refresh handled client-side.
- **Google OAuth 2.0** — sign in with Google via Passport.js, alongside standard email/password auth.
- **Password Recovery** — email-based forgot/reset password flow via Nodemailer.
- **Groups & Membership Roles** — create groups, invite members by email, and manage per-group `ADMIN` / `MEMBER` roles. Inviting, removing members, changing roles, and updating/deleting a group are admin-only actions, enforced server-side.
- **Tasks & Sub-Tasks** — one-level task hierarchy. Sub-tasks inherit their parent's group and assignees; a task can't be completed while it still has pending sub-tasks.
- **Fine-Grained Completion Permissions** — only a task's actual assignee(s) can mark it complete — not just anyone with view access, and not the creator by default unless they're also assigned. Creators can always edit/delete regardless of assignment.
- **AI-Assisted Sub-Task Planning** — generate a draft breakdown of a task into sub-tasks with Gemini, using structured JSON output. Generation is a pure, read-only step; nothing is persisted until the user reviews and confirms a batch.
- **Generic AI Text Assist** — a separate `improve-task` endpoint for polishing a task's title/description, independent of the sub-task planning pipeline.
- **Real-time Events** — Socket.io emits task and notification events to the specific users involved (room-scoped per user), not broadcast globally.
- **Scheduled Overdue Tracking** — a `node-cron` job sweeps for tasks past their due date, flips them to `OVERDUE`, and notifies assignees automatically.
- **Activity Log** — every significant action (task/sub-task/group/invitation lifecycle events) is recorded with the acting user, timestamp, and context, for a full audit trail.
- **Soft Deletes Throughout** — tasks, sub-tasks, and notifications are soft-deleted (never hard-removed), with Mongoose pre-find hooks transparently excluding them from normal queries.
- **Transactional Writes** — multi-step operations (task creation with notifications, cascading sub-task deletes, AI-batch sub-task inserts) run inside MongoDB sessions so they can't partially apply.
- **Rate Limiting** — a blunt global limiter across the whole API, plus a stricter, per-user limiter specifically on the Gemini-backed routes (they call a paid external API).
- **Consistent, Validated API Contract** — every mutating endpoint is Zod-validated; every response follows the same `{ success, message, ...}` shape; every error is normalized to `{ success: false, message, code? }` by a central error handler.

---

## Engineering Highlights

A few decisions worth calling out for anyone reading the code:

- **Permission checks live in the service layer, not a generic role gate.** There's no single "requireRole" middleware doing the real work — task completion, sub-task planning, and group administration each check the exact relationship that matters (assignee vs. creator vs. group admin) inline, where the context is available. This is deliberately stricter than a blanket role check.
- **The AI pipeline is a two-step, reviewable flow.** `generateSubTasks` only calls Gemini and returns suggestions — it never touches the database. `createSubTasksBatch` is the only step that persists anything, and it re-validates every field with the same Zod schema a manual sub-task create would use, so nothing from the LLM is trusted blindly.
- **Mongoose model registration deliberately has no explicit collection name override** on `Task` — sub-tasks are just `Task` documents with a `parentId`, kept to exactly one level of nesting by application-level checks rather than a separate model.
- **The scheduler and Socket.io are decoupled from request/response.** Overdue detection runs independently of any HTTP request, and every real-time event is targeted at specific user rooms rather than broadcast — the app scales in relevant-updates-per-connection, not noise.

---

## API Routes

All routes are prefixed with `versionPrefix` (default `/api/v1`).

### Auth — `/auth`

| Method | Endpoint                | Access | Description                          |
| ------ | ------------------------ | ------ | ------------------------------------- |
| POST   | `/register`              | Public | Register a new user                   |
| POST   | `/login`                 | Public | Login, receive access token           |
| POST   | `/refresh-token`         | Public | Exchange refresh cookie for new token |
| GET    | `/me`                    | Auth   | Get current authenticated user        |
| POST   | `/logout`                | Auth   | Clear refresh token / session         |
| POST   | `/forgot-password`       | Public | Request a password reset email       |
| POST   | `/reset-password`        | Public | Reset password with a valid token    |
| GET    | `/google`                | Public | Start Google OAuth flow               |
| GET    | `/google/callback`       | Public | Google OAuth callback, issues tokens  |

### Users — `/users`

| Method | Endpoint  | Access | Description                     |
| ------ | --------- | ------ | -------------------------------- |
| GET    | `/search` | Auth   | Search users by name/email       |
| GET    | `/`       | Auth   | List users                       |
| GET    | `/:id`    | Auth   | Get a user by ID                 |
| PATCH  | `/:id`    | Auth   | Update a user profile            |

### Groups — `/groups`

| Method | Endpoint                | Access       | Description                        |
| ------ | ------------------------ | ------------ | ------------------------------------ |
| POST   | `/`                      | Auth         | Create a group (creator becomes ADMIN) |
| GET    | `/`                      | Auth         | List the current user's groups     |
| GET    | `/:id`                   | Auth         | Get a group by ID                  |
| PATCH  | `/:id`                   | Group ADMIN  | Update group name/description      |
| DELETE | `/:id`                   | Group ADMIN  | Delete a group                     |
| POST   | `/:id/invite`            | Group ADMIN  | Directly add a member (legacy path) |
| DELETE | `/:id/members/:userId`   | Group ADMIN\* | Remove a member                   |
| PATCH  | `/:id/members/role`      | Group ADMIN  | Change a member's role             |
| GET    | `/:groupId/tasks`        | Group member | List a group's tasks               |
| GET    | `/:groupId/invitations`  | Group ADMIN  | List invitations sent for a group  |
| GET    | `/:id/activity`          | Group member | Get a group's activity log         |

\* A member can always remove themselves (leave); removing *another* member requires being a group admin.

### Invitations — `/invitations`

| Method | Endpoint                       | Access      | Description                         |
| ------ | ------------------------------- | ----------- | ------------------------------------- |
| POST   | `/groups/:groupId/invite`       | Group ADMIN | Send an email invitation to a group |
| GET    | `/me`                            | Auth        | List invitations sent to the user   |
| PATCH  | `/:id/respond`                   | Auth        | Accept or decline an invitation     |
| PATCH  | `/:id/cancel`                    | Group ADMIN | Cancel a pending invitation          |

### Tasks & Sub-Tasks — `/tasks`

| Method | Endpoint                              | Access                | Description                                  |
| ------ | -------------------------------------- | --------------------- | --------------------------------------------- |
| POST   | `/`                                     | Auth                  | Create a task (personal or group)             |
| GET    | `/`                                     | Auth                  | List the current user's tasks (paginated)     |
| GET    | `/:id`                                  | Creator/assignee/member | Get a task by ID                            |
| PATCH  | `/:id`                                  | Creator               | Update a task                                 |
| DELETE | `/:id`                                  | Creator               | Soft-delete a task (cascades to sub-tasks)    |
| POST   | `/:id/complete`                         | Assignee               | Mark a task complete                          |
| POST   | `/:id/sub-tasks`                        | Creator               | Add a sub-task                                |
| GET    | `/:id/sub-tasks`                        | Creator/assignee/member | List a task's sub-tasks                     |
| POST   | `/:id/sub-tasks/:subId/complete`        | Assignee               | Mark a sub-task complete                      |
| DELETE | `/:id/sub-tasks/:subId`                 | Creator               | Delete a sub-task                             |
| POST   | `/:id/sub-tasks/generate`               | Creator (rate-limited) | Generate AI sub-task suggestions (not saved) |
| POST   | `/:id/sub-tasks/batch`                  | Creator               | Persist a reviewed batch of sub-tasks         |

### Notifications — `/notifications`

| Method | Endpoint    | Access | Description                        |
| ------ | ----------- | ------ | ------------------------------------ |
| GET    | `/`         | Auth   | List notifications (paginated)       |
| PATCH  | `/read`     | Auth   | Mark specific notifications as read |
| PATCH  | `/read-all` | Auth   | Mark all notifications as read       |
| DELETE | `/:id`      | Auth   | Soft-delete a notification           |

### Activity — `/activity`

| Method | Endpoint | Access | Description                       |
| ------ | -------- | ------ | ----------------------------------- |
| GET    | `/`      | Auth   | Get the current user's activity log |

### AI — `/ai`

| Method | Endpoint         | Access | Description                              |
| ------ | ---------------- | ------ | ------------------------------------------ |
| POST   | `/improve-task`  | Auth   | Improve a task's title/description text   |

---

## Project Structure

```
src/
├── config/         # DB connection, Passport, Gemini client
├── controllers/    # Route handler logic
├── middlewares/    # Auth, error handling, rate limiting, Zod validation
├── models/         # Mongoose schemas (User, Group, GroupInvitation, Task, Notification, ActivityLog)
├── routes/         # Express route definitions
├── scehma/         # Zod validation schemas
├── services/       # Business logic, Gemini integration, email, activity logging
├── utils/          # Response helpers, token generation, email sending
├── seedAdmin.js    # Admin seed script
└── app.js          # App entry point
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB Atlas account (or local MongoDB)
- A Google Gemini API key (for AI features)
- Google OAuth credentials (optional, only needed for the Google sign-in flow)

### Installation

```bash
git clone https://github.com/hakimnuwair/teamtasks-backend.git
cd teamtasks-backend
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PORT=5001
versionPrefix=/api/v1
MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5001/api/v1/auth/google/callback

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Running Locally

```bash
npm run dev     # development, with hot-reload
npm start       # production
```

The server starts on `http://localhost:5001` by default.

### Seed an Admin User

```bash
node src/seedAdmin.js
```

---

## Scripts

| Command       | Description                 |
| ------------- | ---------------------------- |
| `npm run dev` | Start server with nodemon    |
| `npm start`   | Start server in production   |

---

## Deployment

Deployed on **Render** (or any Node.js host). Ensure every environment variable above is configured on the platform before going live, and that `CLIENT_URL` points at the deployed frontend so CORS and OAuth redirects resolve correctly.

---

## Related Repositories

- **Frontend App** — [teamtasks-application](https://github.com/hakimnuwair/teamtasks-application) (React 19 / TypeScript / Tailwind CSS 4)

---

## Author

**Nuwair Hakim** — Full-Stack Developer

[LinkedIn](https://linkedin.com/in/hakimnuwair) · [GitHub](https://github.com/hakimnuwair) · [Portfolio](https://nuwairportfolio.vercel.app)
