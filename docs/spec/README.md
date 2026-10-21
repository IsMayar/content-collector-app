# Website Content Collector implementation pack

This pack specifies the MVP; it is not a completed or deployed application.

Read Website_Content_Collector_MVP.pdf for the full guide, or edit
Website_Content_Collector_MVP.md. The Markdown is the source for the PDF.

Supporting files

- schema_reference.sql: PostgreSQL reference DDL with tenant/project foreign keys,
  uniqueness, indexes and immutable-record update guards. Split into reviewed
  Flyway migrations and test against a real PostgreSQL server before use.
- api_catalog.json: endpoint inventory with actors, example request and response
  shapes, concurrency requirements and idempotency flags. This is not OpenAPI.
- api_contracts.ts: shared TypeScript DTO shapes, without implementation code.
- starter_templates.json: ten versioned templates: eight website niches, one
  web application and one mobile application. Template answers are illustrative.
- contract_examples.json: common command and response examples.
- acceptance_checklist.csv: 32 release scenarios; tests are marked Not run because
  the application has not yet been implemented.
- architecture.png: a deterministic architecture diagram used in the PDF.

Decisions

One responsive web app; React and TypeScript; Tailwind v4; HeroUI v3; RTK Query;
Spring Boot and Java 21; PostgreSQL; private S3-compatible storage; versioned
review; optional AI drafting; email and opt-in SMS; approved exports.
No WordPress or other direct CMS publishing is included.

Proposed prices and limits require pilot and cost validation. Competitor feature
claims were checked against official sources, not copied uncritically.

Verification

JSON parsing, template structure and key/type checks, endpoint uniqueness,
artifact consistency, PDF rendering and structural text checks are performed
while preparing the pack. No application integration tests, real PostgreSQL
migration run, production SMS, paid API generation or live billing call is claimed.
