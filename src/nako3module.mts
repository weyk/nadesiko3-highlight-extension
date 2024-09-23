import { Uri } from 'vscode'

export class ModuleLink {
    uri: Uri
    filePath: string
    mainFilepath: string
    imports: string[]
    importBy: string[]

    constructor (uri: Uri, mainUri?: Uri) {
        this.uri = uri
        this.filePath = uri.fsPath
        this.mainFilepath = mainUri?.fsPath || uri.fsPath
        this.imports = []
        this.importBy = []
    }
}
