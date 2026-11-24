# clane-offline-modules

Some npm modules download a file from somewhere other than the npm registry while they install. On a network that allows `registry.npmjs.org` but not those other hosts, `npm install` stops on them. This repository holds those files, checked against checksums, and an installer that puts them where the modules look.

| Module | Version | What it fetches at install | From |
|---|---|---|---|
| `xlsx` (SheetJS) | 0.20.3 | its own tarball | `cdn.sheetjs.com` |
| `sqlite3` | 6.0.1 | a prebuilt native binary | GitHub release files |
| `prisma` / `@prisma/engines` | 6.19.3 | the query and schema engines | `binaries.prisma.sh` |

These are the versions Clane Analytics 1.13.x pins. Everything else in a project still comes from the npm registry.

## Use it

You need Node 18 or later and a project folder that has a `package.json`. Run the command from the project folder, naming the module you want:

```
npx github:clane-ai/clane-offline-modules install xlsx
npx github:clane-ai/clane-offline-modules install sqlite3
npx github:clane-ai/clane-offline-modules install prisma
```

Name one, two or all three. With no name it does all three. Each command puts only the named modules' files in place and then runs `npm install` in the project, so a module you did not name downloads the normal way. If `npm install` stops on a module you did not name, run the command again for that one.

To use another folder than the current one, add `--project <folder>`:

```
npx github:clane-ai/clane-offline-modules install prisma --project C:\path\to\project
```

The installer detects the platform, checks every file against `manifest.json`, unpacks them under `~/.clane-offline-modules`, then runs `npm install` with the settings below.

| Module | Setting | What it does |
|---|---|---|
| `xlsx` | none (the tarball is added to npm's cache) | npm finds it by its checksum instead of downloading it |
| `sqlite3` | `npm_config_sqlite3_local_prebuilds` | sqlite3 uses the local binary instead of downloading one (only needed during the install) |
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
