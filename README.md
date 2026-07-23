# Train Route Explorer

A browser-only GTFS route timeline explorer. It loads a GTFS zip, builds route indexes in WebAssembly, and renders directional train journeys as 24-hour timelines.

The app is designed for static hosting and does not need a backend.

## Features

- Load a bundled GTFS zip or upload one in the browser.
- Filter stations, train types, transfer points, transfer times, transfer counts, and journey duration.
- Explore outward and return journeys with clickable train timelines.
- Cache computed route context locally with IndexedDB.

## Data

For a hosted demo, place a GTFS zip at:

```text
www/data/gtfs.zip
```

For the default SNCF archive, download it locally with:

```bash
make fetch-gtfs
```

The in-browser URL downloader only works for GTFS URLs whose servers allow cross-origin browser requests. If a provider blocks those requests, download the archive locally and use the server GTFS button instead.

GTFS zip files are intentionally ignored by Git. The repository keeps only `www/data/.gitkeep`.

## Build And Run

Install Rust, Cargo, and `wasm-pack`, for example on Fedora:

```bash
sudo dnf install rust cargo make rust-std-static-wasm32-unknown-unknown
cargo install wasm-pack --locked --version 0.15.0
export PATH="$HOME/.cargo/bin:$PATH"
```

To keep `wasm-pack` available in new terminals, add the same PATH entry to your shell profile, for example `~/.bashrc`.

Then build:

```bash
make build
```

Serve it locally:

```bash
make run
```

Open `http://localhost:8080/`.

## Tests

The browser UI test is a project-specific smoke test. It expects the static server to expose a compatible GTFS archive at `www/data/gtfs.zip`.

With Docker installed and the site running, execute it with:

```bash
make test-ui TEST_URL=http://localhost:8080/
```

## Deployment

The included GitHub Actions workflow builds the site and deploys `dist/` to GitHub Pages on pushes to `main`.

To enable GitHub Pages, set **Settings > Pages > Build and deployment** to **GitHub Actions**.

## Limits

GTFS parsing and indexing happen entirely in the browser. This works best for scoped city, corridor, or regional feeds. Large national feeds should be filtered before publishing, especially for mobile users.

Generated files should stay out of source control:

```text
dist/
pkg/
target/
www/data/*.zip
```
