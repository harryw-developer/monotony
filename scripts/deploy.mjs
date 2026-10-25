// Publishes dist/ to the gh-pages branch, which GitHub Pages serves.
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const remote = execSync('git remote get-url origin').toString().trim()
const dir = mkdtempSync(join(tmpdir(), 'monotony-pages-'))
try {
  cpSync('dist', dir, { recursive: true })
  writeFileSync(join(dir, '.nojekyll'), '')
  run('git init -q -b gh-pages', dir)
  run('git add -A', dir)
  run('git commit -q -m "Deploy Monotony"', dir)
  run(`git push -f ${remote} gh-pages`, dir)
  console.log('Deployed to gh-pages')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
