import {
    Uri
} from 'vscode'
import { nako3docs } from './nako3interface.mjs'
import type { NakoRuntime } from './nako3types.mjs'

class ProjectNode {
    uri: Uri
    children: ProjectNode[]
    parent: ProjectNode|null

    constructor (uri: Uri, parent?: ProjectNode) {
        this.uri = uri
        this.parent = parent ? parent : null
        this.children = []
    }
}

type SyncWalkCallback = (node: ProjectNode) => void
type AsyncWalkCallback = (node: ProjectNode) => Promise<void>
type WalkCallback = SyncWalkCallback|AsyncWalkCallback
export class Nako3Project {
    mainUri: Uri
    nakoRuntime: NakoRuntime
    pluginNames: string[]
    projectTree: ProjectNode

    constructor (uri: Uri) {
        this.mainUri = uri
        this.nakoRuntime = ''
        this.pluginNames = []
        this.projectTree = new ProjectNode(uri)
    }

    async walkTree (node: ProjectNode, callback: WalkCallback): Promise<void> {
        await callback(node)
        for (const child of node.children) {
            await this.walkTree(child, callback)
        }
    }

    async analyze () {
        await this.walkTree(this.projectTree, async (node) => {
            const doc = nako3docs.get(node.uri)
            if (doc) {
                await nako3docs.analyzeOnlyTokenize(doc)
            }
        })
    }
}