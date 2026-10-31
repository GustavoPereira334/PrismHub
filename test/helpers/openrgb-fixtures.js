import { Buffer } from 'node:buffer';
const u16 = n => { const b=Buffer.alloc(2);b.writeUInt16LE(n);return b; };
const u32 = n => { const b=Buffer.alloc(4);b.writeUInt32LE(n);return b; };
const str = s => {const b=Buffer.from(s+'\0');return Buffer.concat([u16(b.length),b]);};
// Independent SDK v3 wire fixtures, from the official packet tables (not production encoders).
export function frame(id, device=0, payload=Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from('ORGB'),u32(device),u32(id),u32(payload.length),payload]);
}
export function descriptor({name='Test motherboard',type=0,direct=true,leds=2,ramVersion=null,staticMode=true}={}) {
  const mode = Buffer.concat([str(direct?'Direct':'Rainbow'),u32(0),u32(direct?32:0),u32(0),u32(0),u32(0),u32(100),u32(0),u32(0),u32(0),u32(100),u32(0),u32(2),u16(0)]);
  const zone = Buffer.concat([str('ARGB header'),u32(1),u32(leds),u32(leds),u32(leds),u16(0)]);
  const staticData=Buffer.concat([str('Static'),u32(1),u32(32),...Array.from({length:9},()=>u32(0)),u32(1),u16(0)]);
  const modes=ramVersion&&staticMode?[mode,staticData]:[mode];
  const body=Buffer.concat([u32(ramVersion?1:type),str(ramVersion?'ENE DRAM':name),str(ramVersion?'ENE':'Test vendor'),str('SDK fixture'),str(ramVersion||'1'),str(''),str('fixture://board'),u16(modes.length),u32(0),...modes,u16(1),zone,u16(leds),...Array.from({length:leds},(_,i)=>Buffer.concat([str('LED '+i),u32(i)])),u16(leds),Buffer.alloc(leds*4)]);
  return Buffer.concat([u32(body.length+4),body]);
}
export { u32 };
