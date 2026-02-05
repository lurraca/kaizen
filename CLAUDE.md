# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kaizen is a Cloudflare Worker written in Rust that monitors the UCD JLPT exam page (https://www.ucd.ie/japan/exams/) for updates about 2026 exam dates. When changes are detected or "2026" appears on the page, it sends a push notification via ntfy.sh.

## Tech Stack

- **Rust** compiled to WebAssembly
- **Cloudflare Workers** (free tier)
- **Cloudflare KV** for storing page state
- **ntfy.sh** for push notifications

## Build Commands

```bash
# Build and dry-run deploy (no Cloudflare auth needed)
npx wrangler deploy --dry-run

# Deploy to Cloudflare (requires auth: npx wrangler login)
npx wrangler deploy

# Test cron trigger locally
npx wrangler dev --test-scheduled

# View logs
npx wrangler tail
```

## Architecture

```
src/lib.rs     # Main worker logic - scheduled event handler
src/shim.mjs   # JS shim that loads the Wasm module
wrangler.toml  # Cloudflare Worker configuration
```

The worker runs on a cron schedule (daily at 9:00 UTC). On each run:
1. Fetches the UCD JLPT page
2. Checks if content contains "2026"
3. Compares content hash with stored value in KV
4. Sends ntfy notification if 2026 found or content changed
5. Updates stored hash

## Configuration

Before deploying, you must:

1. Create KV namespace:
   ```bash
   npx wrangler kv namespace create PAGE_STATE
   ```
   Then add the ID to `wrangler.toml`

2. Set your ntfy topic in `wrangler.toml`:
   ```toml
   [vars]
   NTFY_TOPIC = "your-random-secret-topic"
   ```

3. Subscribe to your topic in the ntfy app on your phone

## Build Quirks

The build uses a custom command in `wrangler.toml` instead of the standard `worker-build` tool due to certificate issues with wasm-bindgen downloads. The build:
1. Compiles Rust to Wasm with cargo
2. Generates JS bindings with wasm-bindgen
3. Copies the shim.mjs entrypoint
