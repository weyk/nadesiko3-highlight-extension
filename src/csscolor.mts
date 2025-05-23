import { logger } from './logger.mjs'

type CssColorEntry = {[color:string]: string}
type CssColorAliasEntry = {[color:string]: string}
export type ColorFormat = '?'|'#3'|'#6'|'#8'|'rgb(,)'|'rgb(,)%'|'rgb( )'|'const'
export interface ColorInfo {
    red: number
    green: number
    blue: number
    alpha: number|undefined
    colorFormat: ColorFormat
}

class CssColor {
    public level1: CssColorEntry = {
        black: '#000000',
        silver: '#c0c0c0',
        gray: '#808080',
        white: '#ffffff',
        maroon: '#800000',
        red: '#ff0000',
        purple: '#800080',
        fuchsia: '#ff00ff',
        green: '#008000',
        lime: '#00ff00',
        olive: '#808000',
        yellow: '#ffff00',
        navy: '#000080',
        blue: '#0000ff',
        teal: '#008080',
        aqua: '#00ffff',
    }

    public level2: CssColorEntry = {
        orange: '#ffa500'
    }

    public level3: CssColorEntry = {
        aliceblue: '#f0f8ff',
        antiquewhite: '#faebd7',
        aqua: '#00ffff',
        aquamarine: '#7fffd4',
        azure: '#f0ffff',
        beige: '#f5f5dc',
        bisque: '#ffe4c4',
        black: '#000000',
        blanchedalmond: '#ffebcd',
        blue: '#0000ff',
        blueviolet: '#8a2be2',
        brown: '#a52a2a',
        burlywood: '#deb887',
        cadetblue: '#5f9ea0',
        chartreuse: '#7fff00',
        chocolate: '#d2691e',
        coral: '#ff7f50',
        cornflowerblue: '#6495ed',
        cornsilk: '#fff8dc',
        crimson: '#dc143c',
        darkblue: '#00008b',
        darkcyan: '#008b8b',
        darkgoldenrod: '#b8860b',
        darkgray: '#a9a9a9',
        darkgreen: '#006400',
        darkgrey: '#a9a9a9',
        darkkhaki: '#bdb76b',
        darkmagenta: '#8b008b',
        darkolivegreen: '#556b2f',
        darkorange: '#ff8c00',
        darkorchid: '#9932cc',
        darkred: '#8b0000',
        darksalmon: '#e9967a',
        darkseagreen: '#8fbc8f',
        darkslateblue: '#483d8b',
        darkslategray: '#2f4f4f',
        darkslategrey: '#2f4f4f',
        darkturquoise: '#00ced1',
        darkviolet: '#9400d3',
        deeppink: '#ff1493',
        deepskyblue: '#00bfff',
        dimgray: '#696969',
        dimgrey: '#696969',
        dodgerblue: '#1e90ff',
        firebrick: '#b22222',
        floralwhite: '#fffaf0',
        forestgreen: '#228b22',
        fuchsia: '#ff00ff',
        gainsboro: '#dcdcdc',
        ghostwhite: '#f8f8ff',
        gold: '#ffd700',
        goldenrod: '#daa520',
        gray: '#808080',
        green: '#008000',
        greenyellow: '#adff2f',
        honeydew: '#f0fff0',
        hotpink: '#ff69b4',
        indianred: '#cd5c5c',
        indigo: '#4b0082',
        ivory: '#fffff0',
        khaki: '#f0e68c',
        lavender: '#e6e6fa',
        lavenderblush: '#fff0f5',
        lawngreen: '#7cfc00',
        lemonchiffon: '#fffacd',
        lightblue: '#add8e6',
        lightcoral: '#f08080',
        lightcyan: '#e0ffff',
        lightgoldenrodyellow: '#fafad2',
        lightgray: '#d3d3d3',
        lightgreen: '#90ee90',
        lightgrey: '#d3d3d3',
        lightpink: '#ffb6c1',
        lightsalmon: '#ffa07a',
        lightseagreen: '#20b2aa',
        lightskyblue: '#87cefa',
        lightslategray: '#778899',
        lightslategrey: '#778899',
        lightsteelblue: '#b0c4de',
        lightyellow: '#ffffe0',
        lime: '#00ff00',
        limegreen: '#32cd32',
        linen: '#faf0e6',
        maroon: '#800000',
        mediumaquamarine: '#66cdaa',
        mediumblue: '#0000cd',
        mediumorchid: '#ba55d3',
        mediumpurple: '#9370db',
        mediumseagreen: '#3cb371',
        mediumslateblue: '#7b68ee',
        mediumspringgreen: '#00fa9a',
        mediumturquoise: '#48d1cc',
        mediumvioletred: '#c71585',
        midnightblue: '#191970',
        mintcream: '#f5fffa',
        mistyrose: '#ffe4e1',
        moccasin: '#ffe4b5',
        navajowhite: '#ffdead',
        navy: '#000080',
        oldlace: '#fdf5e6',
        olive: '#808000',
        olivedrab: '#6b8e23',
        orangered: '#ff4500',
        orchid: '#da70d6',
        palegoldenrod: '#eee8aa',
        palegreen: '#98fb98',
        paleturquoise: '#afeeee',
        palevioletred: '#db7093',
        papayawhip: '#ffefd5',
        peachpuff: '#ffdab9',
        peru: '#cd853f',
        pink: '#ffc0cb',
        plum: '#dda0dd',
        powderblue: '#b0e0e6',
        purple: '#800080',
        rebeccapurple: '#663399',
        red: '#ff0000',
        rosybrown: '#bc8f8f',
        royalblue: '#4169e1',
        saddlebrown: '#8b4513',
        salmon: '#fa8072',
        sandybrown: '#f4a460',
        seagreen: '#2e8b57',
        seashell: '#fff5ee',
        sienna: '#a0522d',
        silver: '#c0c0c0',
        skyblue: '#87ceeb',
        slateblue: '#6a5acd',
        slategray: '#708090',
        slategrey: '#708090',
        snow: '#fffafa',
        springgreen: '#00ff7f',
        steelblue: '#4682b4',
        tan: '#d2b48c',
        teal: '#008080',
        thistle: '#d8bfd8',
        tomato: '#ff6347',
        transparent: '#00000000',
        turquoise: '#40e0d0',
        violet: '#ee82ee',
        wheat: '#f5deb3',
        white: '#ffffff',
        whitesmoke: '#f5f5f5',
        yellow: '#ffff00',
        yellowgreen: '#9acd32'
    }

    public alias: CssColorAliasEntry = {
        aqua: 'cyan',
        fuchsia: 'magenta',
        darkgray: 'darkgrey',
        darkslategray: 'darkslategrey',
        dimgray: 'dimgrey',
        lightgray: 'lightgrey',
        lightslategray: 'lightslategrey',
        gray: 'grey',
        slategray: 'slategrey',
    }

    public colorCodeRegexp = new Map<ColorFormat, RegExp>([
        [
            '#3',
            /^#(?<RX>[0-9A-Fa-f])(?<GX>[0-9A-Fa-f])(?<BX>[0-9A-Fa-f])$/
        ],
        [
            '#6',
            /^#(?<RX>[0-9A-Fa-f]{2})(?<GX>[0-9A-Fa-f]{2})(?<BX>[0-9A-Fa-f]{2})$/
        ],
        [
            '#8',
            /^#(?<RX>[0-9A-Fa-f]{2})(?<GX>[0-9A-Fa-f]{2})(?<BX>[0-9A-Fa-f]{2})(?<AX>[0-9A-Fa-f]{2})$/
        ],
        [
            'rgb(,)',
            /^rgba?\s*\(\s*(?<R>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\s*,\s*(?<G>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\s*,\s*(?<B>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])(\s*,\s*(?<A>1(\.0+)?|0?\.[0-9]*))?\s*\)$/
        ],
        [
            'rgb(,)%',
            /^rgba?\s*\(\s*(?<R>((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)\s*,\s*(?<G>((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)\s*,\s*(?<B>((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)(\s*,\s*(?<A>1(\.0+)?|0?\.[0-9]*))?\s*\)$/
        ],
        [
            'rgb( )',
            /^rgba?\s*\(\s*(?<R>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]|((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)\s*(?<G>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]|((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)\s*(?<B>[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]|((0?|[1-9][0-9]?)(\.[0-9]*)?|100(\.0*)?)%)(\s*\/\s*(?<A>1(\.0+)?|0?\.[0-9]*))?\s\)$/
        ]
    ])

    public all: CssColorEntry

    constructor () {
        this.all = Object.assign({}, this.level1, this.level2, this.level3)
        for (const aliasKey of Object.keys(this.alias)) {
            this.all[this.alias[aliasKey]] = aliasKey
        }
    }

    isColorName (color: string): boolean {
        return this.all[color] !== undefined
    }

    getRgba (color: string): [ number, number, number, number ]|null {
        const log = logger.fromKey('/CssColor.getRgba')
        let r:number,g:number,b:number,a:number
        let colorCode: string
        if (color.startsWith('#')) {
            colorCode = color
        } else {
            colorCode = this.all[color]
        }
        if (!colorCode) {
            log.debug(`getRgba: invalid name "${color}"`)
            return null
        }
        let reg:RegExpExecArray|null
        reg = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])?$/.exec(colorCode)
        if (reg !== null) {
            r = parseInt(reg[1], 16) / 15
            g = parseInt(reg[2], 16) / 15
            b = parseInt(reg[3], 16) / 15
            a = reg[4] ? parseInt(reg[4], 16) / 15 : 1.0
            return [ r, g, b, a ]
        }
        reg = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/.exec(colorCode)
        if (reg !== null) {
            r = parseInt(reg[1], 16) / 255
            g = parseInt(reg[2], 16) / 255
            b = parseInt(reg[3], 16) / 255
            a = reg[4] ? parseInt(reg[4], 16) / 255: 1.0
            return [ r, g, b, a ]
        }
        log.debug(`getRgba: invalid color code "${colorCode}" from "${color}"`)
        return null
    }

    public parseColor (s: string): ColorInfo|null {
        const parseX = (s: string): number => {
            let i = parseInt(s, 16)
            if (s.length === 1) {
                i *= 17
            }
            return i / 255
        }
        const parseD = (s: string): number => {
            let isPercent = false
            if (s.endsWith('%')) {
                s = s.slice(0, -1)
                isPercent = true
            }
            let n = parseFloat(s)
            if (isPercent) {
                n = n / 100
            } else {
                n = n / 255
            }
            return n
        }
        const parseA = (s: string): number => {
            let isPercent = false
            if (s.endsWith('%')) {
                s = s.slice(0, -1)
                isPercent = true
            }
            let n = parseFloat(s)
            if (isPercent) {
                n = n / 100
            }
            return n
        }
        for (const [ formatName, re] of this.colorCodeRegexp) {
            const colorFormat = formatName
            const rslt = re.exec(s)
            if (rslt && rslt.groups) {
                let r
                let g
                let b
                let a
                if (rslt.groups['RX']) { r = parseX(rslt.groups['RX']) }
                if (rslt.groups['GX']) { g = parseX(rslt.groups['GX']) }
                if (rslt.groups['BX']) { b = parseX(rslt.groups['BX']) }
                if (rslt.groups['AX']) { a = parseX(rslt.groups['AX']) }
                if (rslt.groups['R']) { r = parseD(rslt.groups['R']) }
                if (rslt.groups['G']) { g = parseD(rslt.groups['G']) }
                if (rslt.groups['B']) { b = parseD(rslt.groups['B']) }
                if (rslt.groups['A']) { a = parseA(rslt.groups['A']) }
                if (r === undefined || g === undefined || b === undefined) {
                    continue
                }
                return {
                    red: r,
                    green: g,
                    blue: b,
                    alpha: a,
                    colorFormat
                }
            }
        }
        return null
    }
}

export const cssColor = new CssColor()
