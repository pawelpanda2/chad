# Architecture Ports Configuration

## Personal Dashboard - Port Configuration

This document defines the port configuration for the personal-dashboard application.

### Environment: Test
| Component | Port | Description |
|-----------|------|-------------|
| Frontend (Test) | 12080 | Next.js development/test server |
| Backend (Test) | 12023 | API backend server (if applicable) |

### Environment: Production
| Component | Port | Description |
|-----------|------|-------------|
| Frontend (Prod) | 12030 | Next.js production server |
| Backend (Prod) | 12033 | API backend server (if applicable) |

### Local Development (Mac)
| Component | Port | Description |
|-----------|------|-------------|
| Dev Server | 3000 | Default Next.js dev server |

### Notes
- This is a Next.js application that runs as a single container
- The application includes both frontend and API routes
- No separate backend container is needed for this project