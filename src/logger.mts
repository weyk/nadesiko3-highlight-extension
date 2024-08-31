const levelTag = ['NONE','LOG','DEBUG','INFO','WARN','ERROR','FALTAL']

class Logger {
    level: number
    constructor () {
        this.level = 0
    }

    setLevel (level: string):void {
        this.level = levelTag.indexOf(level) || 0
    }

    log (message: string):void {
        if (this.level > 0 && this.level <= 1) {
            console.log(message)
        }
    }

    debug (message: string):void {
        if (this.level > 0 && this.level <= 2) {
            console.log(message)
        }
    }

    info (message: string):void {
        if (this.level > 0 && this.level <= 3) {
            console.log(message)
        }
    }

    warn (message: string):void {
        if (this.level > 0 && this.level <= 4) {
            console.log(message)
        }
    }

    error (message: string):void {
        if (this.level > 0 && this.level <= 5) {
            console.log(message)
        }
    }

    fatal (message: string):void {
        if (this.level > 0 && this.level <= 6) {
            console.log(message)
        }
    }
}


export const logger = new Logger()
