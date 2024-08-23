#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs/promises'

const rootDir = path.resolve('.')
const srcDir = path.join(rootDir, 'src')
const buildDir = path.join(rootDir, '.build')
const libDir = path.join(rootDir, 'lib')

async function existDirectory(filepath) {
    try {
        const f = await fs.stat(filepath)
        return f.isDirectory
    } catch (ex) {
        // nop
    }
    return false
}

async function copyToLib(srcbasedir, filename) {
    const srcFilepath = path.join(srcbasedir, filename)
    const destFilepath = path.join(libDir, filename)
    if (!await existDirectory(path.dirname(destFilepath))) {
        await fs.mkdir(path.dirname(destFilepath), { recursive: true })
    }
    return await fs.copyFile(srcFilepath, destFilepath)
}

await copyToLib(buildDir, path.join('nako3', 'command.json'))
await copyToLib(srcDir, 'nadesiko3.language-configuration.json')
