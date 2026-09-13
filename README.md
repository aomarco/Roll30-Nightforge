# Roll30 — Nightforge

Nightforge is a clean-room rebuild of the Roll30 tabletop interface. The app
persists Scenes, Heroes, artwork, setup boards, encounters, equipment, combat,
loot, and completion state through dedicated Nightforge repositories.

The product description lives in [docs/FEATURES.md](./docs/FEATURES.md). The
remaining work is tracked in [docs/TODO.md](./docs/TODO.md).

## Documentation

| Document | Purpose |
|---|---|
| [docs/FEATURES.md](./docs/FEATURES.md) | Complete product and capability description |
| [docs/TODO.md](./docs/TODO.md) | Open backlog and settled decisions |
| [docs/RELEASE.md](./docs/RELEASE.md) | Maintained release evidence |
| [WORKFLOW.md](./WORKFLOW.md) | Required development and delivery workflow |
| [PARITY_REGISTER.md](./PARITY_REGISTER.md) | Acceptance journeys and evidence |

## Run locally

```bash
npm install
npm run dev
```

Vite prints the local development URL. Use `npm run preview` after a build to
serve the generated output.

## Build and deploy

```bash
npm run build
npm run build:preview
```

The production build uses the `/Roll30/` GitHub Pages base. The preview build
uses `/Roll30-Nightforge/`. The Pages workflow builds and publishes directly.

## Verification

```bash
npm run lint
npm run typecheck
npm run verify
```

Useful focused commands include:

| Command | Coverage |
|---|---|
| `npm run test` | Domain, repository, and integration tests |
| `npm run test:hardening` | Corrupt data, quota failures, large collections, and long content |
| `npm run test:browser` | Pinned-Chromium browser journeys and visual baselines |
| `npm run verify:hardening` | Accessibility, performance, purity, and parity contracts |
| `npm run verify:release` | GitHub Pages bases, workflow, and storage-isolation contracts |
| `npm run acceptance:release -- <url> </base/>` | Live deployment acceptance checks |

## Catalog maintenance

The checked-in catalog is generated only from a caller-supplied public SRD 5.1
directory. Nightforge never reads the original Roll30 project or user data.

The directory must contain:

- `5e-SRD-Equipment.json`
- `5e-SRD-Magic-Items.json`
- `MAGIC_ITEM_FILE_SYSTEM.txt`

Regenerate into the default tracked output with:

```bash
npm run catalog:generate -- <path-to-srd-directory>
```

Review intentional catalog changes, update the manifest hashes, then run the
focused equipment verification and the complete `npm run verify` gate.

Monster data uses the same explicit-input boundary:

```bash
npm run monsters:generate
```

SRD inputs remain external and are never bundled as application or user data.
