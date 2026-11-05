import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  collectInventory, defaultSkillRoots, listPlugins, parseSkillDoc, scanSkillRoots
} from '../lib/discover.js'

const SKILL_DOC = `---
name: my-skill
description: "Handles invoices and PDF export, quoted: yes"
whenToUse: 用户要开票时
metadata:
  internal: true
---

# Body
`

test('parseSkillDoc reads name, description and whenToUse', () => {
  const meta = parseSkillDoc(SKILL_DOC)
  assert.equal(meta.name, 'my-skill')
  assert.equal(meta.description, 'Handles invoices and PDF export, quoted: yes')
  assert.equal(meta.whenToUse, '用户要开票时')
})

test('parseSkillDoc tolerates missing frontmatter', () => {
  assert.deepEqual(parseSkillDoc('# no frontmatter'), { name: '', description: '', whenToUse: '' })
})

test('parseSkillDoc joins folded values', () => {
  const doc = '---\nname: x\ndescription: first line\n  second line\n---\n'
  assert.equal(parseSkillDoc(doc).description, 'first line second line')
})

test('parseSkillDoc strips YAML block scalar indicators', () => {
  const folded = '---\nname: x\ndescription: >\n  Handles invoices\n  and PDF export.\n---\n'
  assert.equal(parseSkillDoc(folded).description, 'Handles invoices and PDF export.')
  const literal = '---\nname: x\ndescription: |-\n  line one\n  line two\n---\n'
  assert.equal(parseSkillDoc(literal).description, 'line one line two')
  const sameLine = '---\nname: x\ndescription: > Handles invoices\n---\n'
  assert.equal(parseSkillDoc(sameLine).description, 'Handles invoices')
})

test('scanSkillRoots reads <root>/<skill>/SKILL.md and skips duplicates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'need-router-'))
  try {
    await mkdir(path.join(root, 'alpha'), { recursive: true })
    await writeFile(path.join(root, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: first\n---\n')
    await mkdir(path.join(root, 'beta'), { recursive: true })
    await writeFile(path.join(root, 'beta', 'SKILL.md'), '---\nname: alpha\ndescription: duplicate\n---\n')
    await mkdir(path.join(root, 'empty'), { recursive: true })
    const skills = await scanSkillRoots([root])
    assert.deepEqual(skills.map((skill) => skill.name), ['alpha'])
    assert.equal(skills[0].source, 'filesystem')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('defaultSkillRoots includes project-local roots first', async () => {
  const roots = await defaultSkillRoots('/work/demo')
  assert.equal(roots[0], path.resolve('/work/demo/.agents/skills'))
  assert.equal(roots[1], path.resolve('/work/demo/.claude/skills'))
  assert.ok(roots.some((root) => root.includes('.agents')))
})

test('collectInventory prefers the host skill and tool registries', async () => {
  const fakeCtx = {
    get(name) {
      if (name === 'skills') {
        return {
          list: async () => [
            { name: 'zeta', description: 'second', source: 'user-agents' },
            { name: 'alpha', description: 'first', source: 'user-agents' }
          ],
          get: async (skillName) => ({ name: skillName, content: `body of ${skillName}` })
        }
      }
      if (name === 'tools') {
        return { schemas: () => [{ name: 'b_tool', description: 'b' }, { name: 'a_tool', description: 'a' }] }
      }
      return undefined
    }
  }
  const inventory = await collectInventory(fakeCtx, { profileDirs: [] })
  assert.equal(inventory.skillsVia, 'service')
  assert.deepEqual(inventory.skills.map((skill) => skill.name), ['alpha', 'zeta'])
  assert.deepEqual(inventory.tools.map((tool) => tool.name), ['a_tool', 'b_tool'])
  assert.deepEqual(inventory.skillSources, { 'user-agents': 2 })
  assert.deepEqual(inventory.plugins, { dir: null, names: [] })
})

test('collectInventory falls back to the filesystem without a skill service', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'need-router-home-'))
  const skillsRoot = path.join(home, '.agents', 'skills')
  await mkdir(path.join(skillsRoot, 'fallback-skill'), { recursive: true })
  await writeFile(path.join(skillsRoot, 'fallback-skill', 'SKILL.md'), '---\nname: fallback-skill\ndescription: works offline\n---\n')
  const previousHome = process.env.HOME
  const previousProfile = process.env.USERPROFILE
  try {
    process.env.HOME = home
    process.env.USERPROFILE = home
    const inventory = await collectInventory({ get: () => undefined }, { profileDirs: [] })
    assert.equal(inventory.skillsVia, 'filesystem')
    assert.ok(inventory.skills.some((skill) => skill.name === 'fallback-skill'))
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = previousProfile
    await rm(home, { recursive: true, force: true })
  }
})

test('listPlugins reads the first profile that has dependencies', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'need-router-profile-'))
  try {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'b-pkg': '1.0.0', 'a-pkg': '2.0.0' } }))
    const plugins = await listPlugins({ profileDirs: [path.join(dir, 'missing'), dir] })
    assert.deepEqual(plugins.names, ['a-pkg', 'b-pkg'])
    assert.equal(plugins.dir, dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
