# reela

Generative AI cinematic video studio for creating high-quality AI-powered films and videos with advanced prompting and data-driven composition.

## Overview

reela is a **web-based generative AI cinematic video studio** that empowers creators to compose immersive, AI-generated videos. Leveraging modern AI models, reela combines advanced prompting, structured data manipulation, and automated video composition techniques to produce cinematic sequences with minimal manual effort. The platform is designed for filmmakers, content creators, and digital storytellers seeking to prototype or generate videos rapidly.

---

## Key Features

* **AI-Powered Video Composition**: Generate cinematic sequences using structured prompts and creative input.
* **Data-Driven Scenes**: Manipulate and inject dynamic data to influence narrative, visuals, and timing.
* **Multi-Model LLM Support**: Supports Google Gemini (default), OpenAI, Anthropic, Cohere, and other providers via AI SDK.
* **Interactive Web Studio**: Intuitive interface for composing videos, previewing outputs, and editing prompts.
* **Persistent Storage**: User projects, scenes, and metadata stored in PostgreSQL (managed by Supabase).
* **High-Performance Rendering**: Optimized with Next.js, Node.js, and TypeScript for responsive, real-time workflows.
* **Future-Ready**: Easily extendable with new AI models, media assets, or output formats.

---

## Tech Stack

* **Next.js** — React framework with App Router for performance and server rendering.
* **Node.js** — Backend runtime for API and processing logic.
* **TypeScript** — Ensures type safety and maintainable codebase.
* **AI SDK** — Unified API for text, structured objects, and tool calls with LLMs.
* **PostgreSQL** — Managed by Supabase for persistent storage.
* **drizzle-kit** — ORM for TypeScript/PostgreSQL integration.
* **shadcn/ui + Tailwind CSS** — Accessible, reusable UI components and styling.
* **Vercel** — Web app deployment platform.

---

## Getting Started (Developer)

1. Clone the repository:

```bash
git clone <repo-url> reela
cd reela
```

2. Install dependencies:

```bash
pnpm install
# or npm install / yarn install
```

3. Setup environment variables:

```bash
cp .env.example .env
# configure AI_PROVIDER, SUPABASE_URL, SUPABASE_KEY, NEXT_PUBLIC_VERCEL_URL, etc.
```

4. Run locally:

```bash
pnpm dev
# visit http://localhost:3000
```

5. Build for production:

```bash
pnpm build
pnpm start
```

6. Deploy to Vercel (recommended) or preferred hosting platform.

---

## Usage

* Create projects and compose cinematic sequences using the web UI.
* Experiment with different AI models, prompts, and structured input to generate unique videos.
* Store project data in PostgreSQL via Supabase for persistence and collaboration.
* Extend the platform with new AI models, video effects, or output formats.

---

## Roadmap & Vision

* Integrate real-time collaborative video composition features.
* Add AI-assisted scene editing and timeline visualization.
* Expand output formats (HD, 4K, VR/360).
* Introduce template library for rapid cinematic prototyping.
* Incorporate AI-driven soundtrack and audio mixing.

---

## Contributing

* Fork the repository and create a feature branch.
* Submit PRs with enhancements, bug fixes, or new AI integrations.
* Follow coding and styling conventions (TypeScript, Tailwind CSS, and shadcn/ui guidelines).

---

## License

MIT License

---
