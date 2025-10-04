**# Tech Stack**

**Version:** 1.1.0  
**Last Updated:** 2024-12-19

**## Context**
Global tech stack defaults for Agent OS projects, overridable in project-specific `.agent-os/product/tech-stack.md`.

**## Core Stack**
- Backend Framework: Fastify 5.x
- Language: TypeScript 5.7+
- Primary Database: PostgreSQL 18+
- Cache Layer: Redis 7.x (Upstash for serverless)
- ORM: Drizzle ORM latest
- JavaScript Framework: React 19.x
- Build Tool: Vite 6.x
- Import Strategy: Node.js ES modules
- Package Manager: pnpm 10.x
- Node Version: 22 LTS

**## Frontend & UI**
- CSS Framework: TailwindCSS 4.0+
- UI Components: shadcn/ui latest
- Font Provider: Google Fonts
- Font Loading: Self-hosted for performance
- Icons: Lucide React 0.5x+

**## API & Data Layer**
- API Rate Limiting: p-queue 9.x
- Background Jobs: BullMQ 5.x
- Schema Validation: Zod 3.x
- API Authentication: JWT + Redis sessions

**## Infrastructure**
- Application Hosting: Railway
- Hosting Region: Primary region based on user base
- Database Hosting: Neon PostgreSQL
- Cache Hosting: Upstash Redis
- Database Backups: Daily automated
- Asset Storage: Amazon S3
- CDN: CloudFront

**## Monitoring & Operations**
- Error Tracking: Sentry 8.x
- Performance Monitoring: Sentry Performance
- Logging: Structured JSON logging to Sentry
- Uptime Monitoring: Sentry Cron Monitoring

**## CI/CD & Deployment**
- CI/CD Platform: GitHub Actions
- CI/CD Trigger: Push to main/staging branches
- Tests: Run before deployment
- Test Framework: Vitest 2.x
- Linting: Biome 2.x
- Production Environment: main branch
- Staging Environment: staging branch
- Preview Environments: Automatic per-PR (Railway)
- Deployment Strategy: staging → production promotion
- Container Strategy: Docker for production builds

**## Browser Extension**
- Extension Framework: WXT 0.20+
- Extension Build: Separate from API service
- Extension Target: Chrome/Firefox cross-browser
- Extension Storage: browser.storage.local + IndexedDB

---

## Changelog

### v1.1.0 (2024-12-19)
- Updated TypeScript from 5.6+ to 5.7+
- Updated PostgreSQL from 17+ to 18+
- Updated Lucide React from 0.4x+ to 0.5x+
- Updated p-queue from 8.x to 9.x
- Updated Biome from 1.9+ to 2.x
- Updated WXT from 0.19+ to 0.20+
- Added preview environments and deployment strategy

### v1.0.0 (2024-12-19)
- Initial version with core tech stack defaults