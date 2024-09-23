const levelTag = ['NONE','LOG','DEBUG','INFO','WARN','ERROR','FATAL']

class Logger {
    level: number

    constructor () {
        this.level = 0
        console.log(`logger:created`)
    }

    setLevel (level: string):void {
        let lvl = levelTag.indexOf(level)
        if (lvl === -1) {
            console.error(`loger:log level is invalid:${level}`)
            lvl = 0
        }
        console.log(`logger: set log level to ${level}(${lvl})`)
        this.level = lvl
    }

    log (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 1) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>1):log:dropped(${message})`)
        }
    }

    debug (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 2) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>2):log:dropped(${message})`)
        }
    }

    info (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 3) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>3):log:dropped(${message})`)
        }
    }

    warn (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 4) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>4):log:dropped(${message})`)
        }
    }

    error (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 5) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>5):log:dropped(${message})`)
        }
    }

    fatal (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 6) {
            console.log(message)
        } else {
            console.log(`logger(${this.level||"NONE"}>6):log:dropped(${message})`)
        }
    }
}

export const logger = new Logger()
