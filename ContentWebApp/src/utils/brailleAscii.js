const ORDER = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";
const MAP = Object.fromEntries([...ORDER].map((ch, i) => [ch, String.fromCodePoint(0x2800 + i)]));

export function brailleAsciiToUnicode(str) {
  return [...str.toUpperCase()].map((ch) => MAP[ch] ?? ch).join("");
}
