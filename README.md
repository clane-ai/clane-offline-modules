# clane-offline-modules

Some npm modules download a file from somewhere other than the npm registry while they install. On a network that allows `registry.npmjs.org` but not those other hosts, `npm install` stops on them. This repository holds those files, checked against checksums, and an installer that puts them where the modules look.

| Module | Version | What it fetches at install | From |
|---|---|---|---|
| `xlsx` (SheetJS) | 0.20.3 | its own tarball | `cdn.sheetjs.com` |
| `sqlite3` | 6.0.1 | a prebuilt native binary | GitHub release files |
| `prisma` / `@prisma/engines` | 6.19.3 | the query and schema engines | `binaries.prisma.sh` |
| `odbc` | 2.5.0 | a prebuilt native binary | GitHub release files (IBM/node-odbc) |
| `@cubejs-backend/native` and `@cubejs-backend/cubestore` (the Cube engine) | 1.7.50 | the engine's native addon and the Cube Store binary | GitHub release files (cube-js/cube) |

These are the versions Clane Analytics 1.13.x pins. Everything else in a project still comes from the npm registry.

## Use it

You need Node 18 or later and a project folder that has a `package.json`. Run the command from the project folder, naming the module you want:

```
npx github:clane-ai/clane-offline-modules install xlsx
npx github:clane-ai/clane-offline-modules install sqlite3
npx github:clane-ai/clane-offline-modules install prisma
npx github:clane-ai/clane-offline-modules install odbc
npx github:clane-ai/clane-offline-modules install cube
```

Name one or more. With no name it does all five. Each command puts only the named modules' files in place and then runs `npm install` in the project, so a module you did not name downloads the normal way. If `npm install` stops on a module you did not name, run the command again for that one.

To use another folder than the current one, add `--project <folder>`:

```
npx github:clane-ai/clane-offline-modules install prisma --project C:\path\to\project
```

The installer detects the platform, checks every file against `manifest.json`, unpacks them under `~/.clane-offline-modules`, then runs `npm install` with the settings below.

| Module | Setting | What it does |
|---|---|---|
| `xlsx` | none (the tarball is added to npm's cache) | npm finds it by its checksum instead of downloading it |
| `sqlite3` | `npm_config_sqlite3_local_prebuilds` | sqlite3 uses the local binary instead of downloading one (only needed during the install) |
| `odbc` | none (npm installs without running scripts, the installer unpacks the binary into `node_modules/odbc`, then `npm rebuild` runs the held-back scripts) | odbc finds its binary and does not download or compile one |
| `cube` | none (same method as `odbc`: the binaries are unpacked into `node_modules/@cubejs-backend/native` and `.../cubestore/downloaded/latest`, then the held-back scripts run with Cube Store's own download switched off) | the Cube engine finds its binaries and does not download them |
| `prisma` | `PRISMA_QUERY_ENGINE_LIBRARY`, `PRISMA_SCHEMA_ENGINE_BINARY`, `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` | Prisma uses the local engines instead of downloading them |

After `install prisma` (or all three), keep the Prisma settings set in the shell you start the project from: `prisma generate` and `prisma migrate` need them too. The installer prints the exact lines to paste, with `setx` for Windows.

`npx github:...` needs `git` installed (npm uses it to fetch from GitHub) and access to github.com. If either is missing, download the repository as a zip (**Code → Download ZIP**), unzip it, and run `node bin/install.mjs install xlsx` (and so on) from the project folder.

### On Windows

- Install Git for Windows and Node (`winget install Git.Git` and `winget install OpenJS.NodeJS.LTS`), then open a new PowerShell window.
- If PowerShell says *running scripts is disabled on this system* for `npx`, run the same command with `npx.cmd` instead of `npx`.
- Behind a company proxy, set it the way npm expects (`npm config set proxy ...` and `npm config set https-proxy ...`) before running the installer. Only the registry and GitHub need to be reachable.

### Options

| | |
|---|---|
| `--project <folder>` | the project folder (default: the current folder) |
| `--ci` | `npm ci` instead of `npm install` (it deletes `node_modules` first) |
| `--no-npm`, or the `env` command | put the files in place and print the settings only |
| `--force` | go on when the project's `package-lock.json` asks for other versions of the named modules (their files are then not used) |

## What is included

| Platform | sqlite3 | odbc | Prisma engines |
|---|---|---|---|
| Windows x64 | yes | yes | `windows` |
| Linux x64, glibc, OpenSSL 3 (Ubuntu 22.04+, Debian 12+) | yes | yes | `debian-openssl-3.0.x` |
| Linux x64, glibc, OpenSSL 3 (Amazon Linux 2023, RHEL 9) | yes | yes | `rhel-openssl-3.0.x` |
| macOS Apple silicon | yes | yes | `darwin-arm64` |
| macOS Intel | yes | yes | `darwin` |

`odbc` is the Node binding only. It needs an ODBC driver manager (built into Windows; `unixodbc` on Linux, `brew install unixodbc` on macOS) and the database's own ODBC driver (for example Microsoft ODBC Driver 18 for SQL Server). Those are separate installs and are not in this repository.

`cube` is **Windows x64 only** for now (about 64 MB). Run on another platform it stops with a message; Linux and macOS files can be added on request. The project must have both `@cubejs-backend/native` and `@cubejs-backend/cubestore` at 1.7.50 (Clane 1.13.x does).

Not included: Alpine (musl), Linux ARM, OpenSSL 1.x systems (Ubuntu 20.04, Amazon Linux 2), 32-bit. The installer stops with a message on those.

## Checks

- Every file's SHA-256 is in `manifest.json`; the installer verifies it before use.
- The `xlsx` tarball's SHA-512 integrity is the one npm's lockfile records for `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, so the copy in npm's cache is the one the lockfile expects.
- The Cube files are the release assets of `cube-js/cube` v1.7.50 (`native-win32-x64-unknown-fallback` and `cubestored-x86_64-pc-windows-msvc`), unchanged. The odbc files are the release assets of `IBM/node-odbc` v2.5.0, unchanged. The sqlite3 files are the release assets of `TryGhost/node-sqlite3` v6.0.1, unchanged. The Prisma engines are the files Prisma publishes for engines commit `c2990dca591cba766e3b7ef5d9e8a84796e47ab7`, compressed with gzip and unpacked and re-checked by the installer.

## Licences

The modules keep their own licences (SheetJS: Apache-2.0; node-sqlite3: BSD-3-Clause; node-odbc: MIT; Cube: Apache-2.0; Prisma and its engines: Apache-2.0), and their texts are in `licenses/`. See `NOTICE.md`.
