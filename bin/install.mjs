#!/usr/bin/env node
// clane-offline-modules: installs the npm modules that download files at install time
// (SheetJS xlsx, sqlite3's prebuilt binary, Prisma's engines) from copies kept in this
// repository, so a machine that can reach npm but not those hosts can still `npm install`.
//
//   npx github:clane-ai/clane-offline-modules install [xlsx] [sqlite3] [prisma] [--project <folder>]
//   npx github:clane-ai/clane-offline-modules env     [xlsx] [sqlite3] [prisma]
//
// No module named means all three. No dependencies. Node 18 or later. See README.md.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, copyFileSync, chmodSync, rmSync, renameSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const store = join(homedir(), ".clane-offline-modules");
const m = manifest.modules;
const ALL = ["xlsx", "sqlite3", "prisma"];

const die = (msg) => { console.error(`\nFAIL  ${msg}`); process.exit(1); };
const say = (msg) => console.log(msg);

// ---- arguments ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set();
const words = [];
let project = process.cwd();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--project") project = resolve(argv[++i] ?? die("--project needs a folder."));
  else if (argv[i].startsWith("--")) flags.add(argv[i]);
  else words.push(argv[i]);
}
const [command, ...picked] = words;

if (!["install", "env"].includes(command) || flags.has("--help")) {
  say(`clane-offline-modules ${manifest.bundle}

  install [module ...]   put the files for the named modules in place, then run npm install in the project
  env     [module ...]   put the files in place and print the settings only (no npm)

  modules: ${ALL.join(", ")}   (none named = all three)

  --project <folder>     the project folder (default: the current folder)
  --ci                   use "npm ci" instead of "npm install" (deletes node_modules first)
  --no-npm               same as env
  --force                go on when the project's lockfile asks for other versions

Examples:
  npx github:clane-ai/clane-offline-modules install xlsx
  npx github:clane-ai/clane-offline-modules install prisma --project C:\\work\\app`);
  process.exit(command ? 0 : 2);
}
const bad = picked.filter((p) => !ALL.includes(p));
if (bad.length) die(`"${bad.join('", "')}" is not a module here. Choose from: ${ALL.join(", ")}. To name the project folder use --project <folder>.`);
const mods = picked.length ? [...new Set(picked)] : ALL;

const sha256 = async (file) => {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
};
const check = async (file, expected, what) => {
  const got = await sha256(file);
  if (got !== expected) die(`${what} does not match the checksum in manifest.json (${got}). The download is damaged or has been changed; fetch it again.`);
};

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 18) die(`Node ${process.versions.node} is too old; use Node 18 or later (Node 22 is what Clane Analytics uses).`);

mkdirSync(store, { recursive: true });
const settings = {}; // environment for npm and, for Prisma, for later commands
const keep = {};     // the part that must stay set after the install
const done = [];
const key = `${process.platform}-${process.arch}`;

const needPlatform = () => {
  if (!["win32-x64", "linux-x64", "darwin-arm64", "darwin-x64"].includes(key)) die(`${key} is not in this bundle (it holds win32-x64, linux-x64, darwin-arm64 and darwin-x64).`);
};

// ---- xlsx: the tarball goes into npm's cache under the integrity the lockfile records -
let xlsxFile;
if (mods.includes("xlsx")) {
  xlsxFile = join(root, m.xlsx.file);
  await check(xlsxFile, m.xlsx.sha256, "xlsx tarball");
  const integrity = "sha512-" + createHash("sha512").update(readFileSync(xlsxFile)).digest("base64");
  if (integrity !== m.xlsx.integrity) die("xlsx tarball integrity differs from the one npm's lockfile records.");
  done.push(`xlsx ${m.xlsx.version}`);
}

// ---- sqlite3: prebuild-install looks for the release file by name in a local folder ---
if (mods.includes("sqlite3")) {
  needPlatform();
  if (key === "linux-x64") {
    // sqlite3's published Linux binary is built against glibc 2.38; on an older system it installs but will not load.
    const glibc = process.report?.getReport?.()?.header?.glibcVersionRuntime;
    if (glibc && glibc.split(".").map(Number).reduce((a, n, i) => a + n / 100 ** i, 0) < 2.38) {
      console.warn(`WARN  This machine has glibc ${glibc}. sqlite3's Linux binary needs 2.38 or newer (Ubuntu 24.04, Debian 13), so require("sqlite3") will fail here.`);
    }
  }
  const sq = m.sqlite3.files[key];
  const prebuilds = join(store, "prebuilds");
  mkdirSync(prebuilds, { recursive: true });
  await check(join(root, sq.file), sq.sha256, "sqlite3 prebuilt binary");
  copyFileSync(join(root, sq.file), join(prebuilds, sq.name));
  settings.npm_config_sqlite3_local_prebuilds = prebuilds;
  done.push(`sqlite3 ${m.sqlite3.version} (${key})`);
}

// ---- prisma: engines are stored compressed; unpack the two this platform needs --------
if (mods.includes("prisma")) {
  needPlatform();
  let target;
  if (key === "win32-x64") target = "windows";
  else if (key === "darwin-arm64") target = "darwin-arm64";
  else if (key === "darwin-x64") target = "darwin";
  else {
    if (existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/libc.musl-x86_64.so.1")) die("This is Alpine (musl) Linux. This bundle holds glibc Linux builds only.");
    let family = "debian";
    try {
      const os = readFileSync("/etc/os-release", "utf8").replace(/"/g, "");
      if (/^(ID|ID_LIKE)=.*\b(rhel|fedora|centos|amzn)\b/m.test(os)) family = "rhel";
    } catch { /* no os-release: keep debian */ }
    const ssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
    if (ssl.status === 0 && !/OpenSSL 3\./.test(ssl.stdout)) die(`This machine has ${ssl.stdout.trim()}. The Prisma engines in this bundle need OpenSSL 3 (Ubuntu 22.04+, Debian 12+, Amazon Linux 2023, RHEL 9).`);
    target = `${family}-openssl-3.0.x`;
  }
  const pr = m.prisma.targets[target];
  const engines = join(store, `prisma-${m.prisma.version}`);
  mkdirSync(engines, { recursive: true });
  const unpack = async (e) => {
    await check(join(root, e.file), e.sha256_gz, e.name);
    const out = join(engines, e.name);
    const tmp = `${out}.part`;
    await pipeline(createReadStream(join(root, e.file)), createGunzip(), createWriteStream(tmp));
    if ((await sha256(tmp)) !== e.sha256) { rmSync(tmp, { force: true }); die(`${e.name} does not match its checksum after unpacking.`); }
    renameSync(tmp, out);
    if (process.platform !== "win32") chmodSync(out, 0o755);
    return out;
  };
  keep.PRISMA_QUERY_ENGINE_LIBRARY = await unpack(pr.query);
  keep.PRISMA_SCHEMA_ENGINE_BINARY = await unpack(pr.schema);
  keep.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
  Object.assign(settings, keep);
  done.push(`prisma engines ${m.prisma.version} (${target})`);
}

say(`ok  ${done.join(", ")}: checked and unpacked in ${store}`);

const printSettings = (which) => {
  if (!Object.keys(which).length) return;
  say("\nKeep these set in the shell you run Prisma from (npm run dev, prisma generate, prisma migrate):\n");
  if (process.platform === "win32") {
    for (const [k, v] of Object.entries(which)) say(`  $env:${k} = "${v}"`);
    say("\nTo keep them for every new PowerShell window, run setx once for each, for example:");
    for (const k of ["PRISMA_QUERY_ENGINE_LIBRARY", "PRISMA_SCHEMA_ENGINE_BINARY"]) if (which[k]) say(`  setx ${k} "${which[k]}"`);
  } else {
    for (const [k, v] of Object.entries(which)) say(`  export ${k}="${v}"`);
    say("\nTo keep them, add the same lines to ~/.bashrc or ~/.zshrc.");
  }
};

if (command === "env" || flags.has("--no-npm")) {
  if (settings.npm_config_sqlite3_local_prebuilds) say(`\nFor a manual npm install of sqlite3, set npm_config_sqlite3_local_prebuilds="${settings.npm_config_sqlite3_local_prebuilds}".`);
  printSettings(keep);
  process.exit(0);
}

// ---- install ------------------------------------------------------------------------
if (!existsSync(join(project, "package.json"))) die(`No package.json in ${project}. Run this from the project folder, or pass --project <folder>.`);

// The files here match one exact version of each module. Another version would fetch its own.
const lockFile = join(project, "package-lock.json");
if (existsSync(lockFile) && !flags.has("--force")) {
  const pk = JSON.parse(readFileSync(lockFile, "utf8")).packages ?? {};
  const want = { xlsx: { xlsx: m.xlsx.version }, sqlite3: { sqlite3: m.sqlite3.version }, prisma: { prisma: m.prisma.version, "@prisma/engines": m.prisma.version } };
  const wrong = mods.flatMap((mod) => Object.entries(want[mod]))
    .filter(([name, v]) => pk[`node_modules/${name}`] && pk[`node_modules/${name}`].version !== v)
    .map(([name, v]) => `${name}: the project's lockfile has ${pk[`node_modules/${name}`].version}, this bundle holds ${v}`);
  if (wrong.length) die(`The project's package-lock.json asks for other versions than this bundle holds:\n  ${wrong.join("\n  ")}\nUse the bundle release that matches, or pass --force to try anyway.`);
}

// On Windows npm is a .cmd file, so it runs through a shell, which splits an unquoted path at a space.
const quote = (a) => (process.platform === "win32" && /[\s&()^%!]/.test(a) ? `"${a}"` : a);
const npm = (npmArgs, cwd) =>
  spawnSync("npm", npmArgs.map(quote), { cwd, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...settings } });

let r;
if (xlsxFile) {
  say(`\nAdding the xlsx tarball to npm's cache ...`);
  r = npm(["cache", "add", xlsxFile], project);
  if (r.status !== 0) die("npm cache add failed.");
}

const npmArgs = flags.has("--ci") ? ["ci", "--prefer-offline"] : ["install", "--prefer-offline"];
say(`\nRunning npm ${npmArgs.join(" ")} in ${project} ...\n`);
r = npm(npmArgs, project);
if (r.status !== 0) {
  const left = ALL.filter((x) => !mods.includes(x));
  die(`npm ${npmArgs[0]} failed (exit ${r.status}).${left.length ? ` If it names ${left.join(" or ")}, run this installer for that module too.` : ""} If it names another host than registry.npmjs.org, tell Clane which.`);
}

say("\nok  npm install finished.");
printSettings(keep);
