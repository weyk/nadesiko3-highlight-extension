
const levelTag = ['NONE','LOG','DEBUG','INFO','WARN','ERROR','FATAL']

class Logger {
        level: number

        constructor () {
        this.level = 0
        console.log(`logger:created`)
    }

    /**
     * ロガーの出力レベルを指定したレベルにする。
     * 指定した文字列が無効ならばNONEとなる。
     * @param level {string} - レベルを文字列で指定する
     */
    setLevel (level: string):void {
        let lvl = levelTag.indexOf(level)
        if (lvl === -1) {
            console.error(`loger:log level is invalid:${level}`)
            lvl = 0
        }
        console.log(`logger: set log level to ${level}(${lvl})`)
        this.level = lvl
    }

    /**
     * ロガーからLOGレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    log (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 1) {
            console.log(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>1):log:dropped(${message})`)
        }
    }

    /**
     * ロガーからDEBUGレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    debug (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 2) {
            console.debug(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>2):log:dropped(${message})`)
        }
    }

    /**
     * ロガーからINFOレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    info (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 3) {
            console.info(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>3):log:dropped(${message})`)
        }
    }

    /**
     * ロガーからWARNレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    warn (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 4) {
            console.warn(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>4):log:dropped(${message})`)
        }
    }

    /**
     * ロガーからERRORレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    error (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 5) {
            console.error(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>5):log:dropped(${message})`)
        }
    }

    /**
     * ロガーからFATALレベルのメッセージを出力する
     * @param message {string} - 表示するメッセージ
     * @param t {amy} - 使用しない。互換性のため。
     */
    fatal (message: string, t?: any):void {
        if (this.level > 0 && this.level <= 6) {
            console.log(message)
        } else {
            // console.log(`logger(${this.level||"NONE"}>6):log:dropped(${message})`)
        }
    }
}

export const logger = new Logger()
