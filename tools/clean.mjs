#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs/promises'

async function existFileOrDirectory(filepath) {
    try {
        const f = await fs.stat(filepath)
        return f.isDirectory || f.isFile
    } catch (ex) {
        // nop
    }
    return false
}

async function rmFileOrDirectory(filepath) {
    if (await existFileOrDirectory(filepath)) {
        await fs.rm(filepath, { recursive: true })
    }
}
const rootDir = path.resolve('.')
const buildDir = path.join(rootDir, '.build')
const testDir = path.join(rootDir, '.test')
const libDir = path.join(rootDir, 'lib')

await rmFileOrDirectory(buildDir, { recursive: true })
await rmFileOrDirectory(testDir, { recursive: true })
await rmFileOrDirectory(libDir, { recursive: true })
