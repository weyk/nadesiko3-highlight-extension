const SerialIdStart = 0
const SerialIdMax = 999999

export function setSerialId(): number {
    return SerialIdStart
}

export function incSerialId(serialId: number): number {
    if (serialId >= SerialIdMax) {
        return SerialIdStart
    }
    return serialId + 1
}
