# clane-offline-modules

Some npm modules download a file from somewhere other than the npm registry while they install. On a network that allows `registry.npmjs.org` but not those other hosts, `npm install` stops on them. This repository holds those files, checked against checksums, and an installer that puts them where the modules look.

| Module | Version | What it fetches at install | From |
|---|---|---|---|
| `xlsx` (SheetJS) | 0.20.3 | its own tarball | `cdn.sheetjs.com` |
| `sqlite3` | 6.0.1 | a prebuilt native binary | GitHub release files |
| `prisma` / `@prisma/engines` | 6.19.3 | the query and schema engines | `binaries.prisma.sh` |

These are the versions Clane Analytics 1.13.x pins. Everything else in a project still comes from the npm registry.

## Use it

You need Node 18 or later and a project folder that has a `package.json`. Run this from the project folder:

```
npx github:clane-ai/clane-offline-modules install
```

Or name the folder:

```
npx github:clane-ai/clane-offline-modules install C:\path\to\project
```

The installer detects the platform, checks every file against `manifest.json`, unpacks them under `~/.clane-offline-modules`, then runs `npm install` in the project with the settings below. It prints them again at the end.

| Setting | What it does |
|---|---|
| `npm_config_sqlite3_local_prebuilds` | makes sqlite3 use the local binary instead of downloading one |
| `PRISMA_QUERY_ENGINE_LIBRARY`, `PRISMA_SCHEMA_ENGINE_BINARY` | make Prisma use the local engines instead of downloading them |
| `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` | stops Prisma asking its server for a checksum file |

Keep the Prisma settings set in the shell you start the project from (`prisma generate` and `prisma migrate` need them too). `install` prints the exact lines to paste, with `setx` for Windows.

`npx github:...` needs `git` installed (npm uses it to fetch from GitHub) and access to github.com. If either is missing, download the repository as a zip (**Code → Download ZIP**), unzip it, and run `node bin/install.mjs install <project folder>`.

### Options

| | |
|---|---|
| `install --ci` | `npm ci` instead of `npm install` (it deletes `node_modules` first) |
| `install --no-npm`, or `env` | put the files in place and print the settings only |
| `install --force` | go on when the project's `package-lock.json` asks for other versions of these modules (their files are then not used) |

## What is included

| Platform | sqlite3 | Prisma engines |
|---|---|---|
| Windows x64 | yes | `windows` |
| Linux x64, glibc, OpenSSL 3 (Ubuntu 22.04+, Debian 12+) | yes | `debian-openssl-3.0.x` |
| Linux x64, glibc, OpenSSL 3 (Amazon Linux 2023, RHEL 9) | yes | `rhel-openssl-3.0.x` |
| macOS Apple silicon | yes | `darwin-arm64` |
| macOS Intel | yes | `darwin` |

Not included: Alpine (musl), Linux ARM, OpenSSL 1.x systems (Ubuntu 20.04, Amazon Linux 2), 32-bit. The installer stops with a message on those.

## Checks

- Every file's SHA-256 is in `manifest.json`; the installer verifies it before use.
- The `xlsx` tarball's SHA-512 integrity is the one npm's lockfile records for `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, so the copy in npm's cache is the one the lockfile expects.
- The sqlite3 files are the release assets of `TryGhost/node-sqlite3` v6.0.1, unchanged. The Prisma engines are the files Prisma publishes for engines commit `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`, compressed with gzip and unpacked and re-checked by the installer.

## Licences

The modules keep their own licences (SheetJS: Apache-2.0; node-sqlite3: BSD-3-Clause; Prisma and its engines: Apache-2.0), and their texts are in `licenses/`. See `NOTICE.md`.
