import path from 'node:path'

type LogMessage = any

export type LogLevel = 'NONE'|'TRACE'|'DEBUG'|'INFO'|'WARN'|'ERROR'|'FATAL'
const levelTag:LogLevel[] = ['NONE','TRACE','DEBUG','INFO','WARN','ERROR','FATAL']

export interface LogConfig {
    filter: RegExp|null|""
    level: LogLevel
}

class Logger {
    level: number
    baseFolder: string
    config: LogConfig[]
    levelCache: Map<string, number>

    constructor () {
        this.level = 0
        this.config = []
        this.levelCache = new Map()
        this.baseFolder = path.dirname(import.meta.url)
        console.log(`logger:created baseDirectory =  '${this.baseFolder}'`)
    }

    /**
     * ロガーの出力レベルを指定したレベルにする。
     * 指定した文字列が無効ならばNONEとなる。
     * @param level {string} - レベルを文字列で指定する
     */
    setLevel (level: LogLevel):void {
        let lvl = levelTag.indexOf(level)
        if (lvl === -1) {
            console.error(`loger:log level is invalid:${level}`)
            lvl = 0
        }
        console.log(`logger: set log level to ${level}(${lvl})`)
        this.level = lvl
    }

    setBaseFolder (baseFolder: string):void {
        if (baseFolder !== this.baseFolder) {
            this.baseFolder = baseFolder
        }
    }

    clearConfig ():void {
        this.config.length = 0
        this.levelCache.clear()
    }

    appendConfig (conf: LogConfig):void {
        this.config.push(conf)
        this.levelCache.clear()
    }

    getlogLevelForKey (key: string):number {
        if (this.levelCache.has(key)) {
            return this.levelCache.get(key)!
        }
        for (const conf of this.config) {
            if (conf.filter !== "" && (conf.filter === null || conf.filter.test(key))) {
                const level = levelTag.indexOf(conf.level)
                this.levelCache.set(key, level)
                return level
            }
        }
        this.levelCache.set(key, 0)
        return 0
    }
    /**
     * ロガーからLOGレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    trace (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 1) {
            this._trace(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>1):log:dropped(${message})`)
        }
    }

    _trace (message: LogMessage, t?: any):void {
        console.log(message)
    }

    /**
     * ロガーからDEBUGレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    debug (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 2) {
            this._debug(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>2):log:dropped(${message})`)
        }
    }

    _debug (message: LogMessage, t?: any):void {
        console.debug(message)
    }

    /**
     * ロガーからINFOレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    info (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 3) {
            this._info(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>3):log:dropped(${message})`)
        }
    }

    _info (message: LogMessage, t?: any):void {
        console.info(message)
    }

    /**
     * ロガーからWARNレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    warn (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 4) {
            this._warn(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>4):log:dropped(${message})`)
        }
    }

    _warn (message: LogMessage, t?: any):void {
        console.warn(message)
    }

    /**
     * ロガーからERRORレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    error (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 5) {
            this._error(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>5):log:dropped(${message})`)
        }
    }

    _error (message: LogMessage, t?: any):void {
            console.error(message)
    }

    /**
     * ロガーからFATALレベルのメッセージを出力する
     * @param key {string} - フィルタリング用のキー
     * @param message {string} - 表示するメッセージ
     * @param t {any} - 使用しない。互換性のため。
     */
    fatal (key: string, message: LogMessage, t?: any):void {
        const level = this.config.length > 0 ? this.getlogLevelForKey(key) : this.level
        if (level > 0 && level <= 6) {
            this._fatal(message, t)
        } else {
            // console.log(`logger(${this.level||"NONE"}>6):log:dropped(${message})`)
        }
    }

    _fatal (message: LogMessage, t?: any):void {
        console.error(message)
    }

    log (key: string, level: string, message: LogMessage, t?: any):void {
        switch (level.toUpperCase()) {
            case 'TRACE': this.trace(key,message,t); break
            case 'DEBUG': this.debug(key,message,t); break
            case 'INFO': this.info(key,message,t); break
            case 'WARN': this.warn(key,message,t); break
            case 'ERROR': this.error(key,message,t); break
            case 'FATAL': this.fatal(key,message,t); break
            default: this.trace(key,message,t); break
        }
    }

    fromKey(key: string): Log {
        return new Log(key)
    }
    fromFile(url: string): Log {
        const fileName = path.basename(url) + path.extname(url)
        let folderPath = path.dirname(url)
        if (folderPath.startsWith(this.baseFolder)) {
            folderPath = folderPath.slice(logger.baseFolder.length)
        }
        return this.fromKey(path.join(folderPath, fileName))
    }
}

export class Log {
    private key: string
    constructor (key: string) {
        this.key = key
    }

    appendKey (key: string):Log {
        return new Log(`${this.key}${key}`)
    }
    trace (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 1) {
            if (typeof message === 'string') {
                logger._trace(`${this.key}:[TRACE]:${message}`, t)
            } else {
                logger._trace(message, t)
            }
        }
    }
    debug (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 2) {
            if (typeof message === 'string') {
                logger._debug(`${this.key}:[DEBUG]:${message}`, t)
            } else {
                logger._debug(message, t)
            }
        }
    }
    info (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 3) {
            if (typeof message === 'string') {
                logger._info(`${this.key}:[INFO ]:${message}`, t)
            } else {
                logger._info(message, t)
            }
        }
    }
    warn (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 4) {
            if (typeof message === 'string') {
                logger._warn(`${this.key}:[WARN ]:${message}`, t)
            } else {
                logger._warn(message, t)
            }
        }
    }
    error (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 5) {
            if (typeof message === 'string') {
                logger._error(`${this.key}:[ERROR]:${message}`, t)
            } else {
                logger._error(message, t)
            }
        }
    }
    fatal (message: LogMessage, t?: any):void {
        const level = logger.getlogLevelForKey(this.key)
        if (level > 0 && level <= 6) {
            if (typeof message === 'string') {
                logger._fatal(`${this.key}:[FATAL]:${message}`, t)
            } else {
                logger._fatal(message, t)
            }
        }
    }
    log (level: string, message: LogMessage, t?: any):void {
        logger.log(this.key, level, message, t)
    }
}


export const logger = new Logger()
