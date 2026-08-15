import fs from "node:fs"
import path from "node:path"

/**
 * Gate de parité dist — Phase 7 A1.
 *
 * Vérifie que `platform/snippet/dist/korvus.min.js` est plus récent que
 * n'importe quel fichier source du snippet. Si non, fail loud AVANT que
 * Playwright ne démarre les webServers.
 *
 * Sans ce gate, un oubli de `npm run snippet:build` fait tourner la suite
 * E2E contre un ancien bundle, et on passe 2h à debugger une "régression"
 * qui est en fait un dist stale. Cf. Phase 0 du cahier de recette.
 */

const ROOT = path.resolve(__dirname, "..", "..")
const PLATFORM_ROOT = process.env.KORVUS_PLATFORM_ROOT
  ? path.resolve(process.env.KORVUS_PLATFORM_ROOT)
  : path.join(ROOT, "platform")
const DIST = path.join(PLATFORM_ROOT, "snippet", "dist", "korvus.min.js")
const SNIPPET_SRC = path.join(PLATFORM_ROOT, "snippet", "src")
// Le build inline les patterns multilingues via esbuild, donc un changement
// dans lib/patterns/** invalide aussi le dist.
const PATTERNS_SRC = path.join(PLATFORM_ROOT, "lib", "patterns")

function walkMaxMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let max = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".json")) continue
      try {
        const mtime = fs.statSync(full).mtimeMs
        if (mtime > max) max = mtime
      } catch {
        /* ignore */
      }
    }
  }
  return max
}

async function globalSetup(): Promise<void> {
  if (!fs.existsSync(DIST)) {
    throw new Error(
      `\n[parity check] Missing snippet dist: ${DIST}\n` +
        `Run 'cd platform && npm run snippet:build' then re-run the tests.\n`,
    )
  }

  const distMtime = fs.statSync(DIST).mtimeMs
  const srcMtime = walkMaxMtime(SNIPPET_SRC)
  const patternsMtime = walkMaxMtime(PATTERNS_SRC)
  const maxSrc = Math.max(srcMtime, patternsMtime)

  if (maxSrc > distMtime) {
    const newest =
      srcMtime > patternsMtime ? "platform/snippet/src/" : "platform/lib/patterns/"
    const distAge = new Date(distMtime).toISOString()
    const srcAge = new Date(maxSrc).toISOString()
    throw new Error(
      `\n[parity check] Stale snippet dist detected.\n` +
        `  dist mtime : ${distAge}\n` +
        `  src mtime  : ${srcAge}  (newest file under ${newest})\n\n` +
        `The tests would run against an outdated bundle. Run:\n` +
        `  cd platform && npm run snippet:build\n` +
        `then re-run Playwright.\n`,
    )
  }
}

export default globalSetup
