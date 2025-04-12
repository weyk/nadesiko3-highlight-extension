/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Disposable,
    commands
} from 'vscode'

export type CommandType = 'editor'|'normal' 
export interface Command {
	readonly id: string
	readonly type: CommandType

	execute(...args: any[]): void
}

export class CommandManager implements Disposable {
	private readonly commands = new Map<string, Disposable>()

	dispose(): void {
		for (const registration of this.commands.values()) {
			registration.dispose()
		}
		this.commands.clear()
	}

	public register<T extends Command>(command: T): T {
		this.registerCommand(command.id, command.type, command.execute, command)													
		return command
	}																																																																																																																																																																													

	private registerCommand(id: string, type: CommandType, impl: (...args: any[]) => void, thisArg?: any) {
		if (this.commands.has(id)) {
			return
		}																															

		switch (type) {
			case 'normal':
				this.commands.set(id, commands.registerCommand(id, impl, thisArg))
				break
			case 'editor':
				this.commands.set(id, commands.registerTextEditorCommand(id, impl, thisArg))
				break
		}
	}
}																																																																																								
