import {
    CancellationToken,
    Uri,
    workspace
} from 'vscode'
import { Nako3DocumentExt } from './nako3documentext.mjs'
import { logger } from './logger.mjs'
import type { NakoRuntime } from './nako3/nako3types.mjs'

export class ProjectNode {
    public uri: Uri
    public children: ProjectNode[]
    public parent: ProjectNode|null

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


}

