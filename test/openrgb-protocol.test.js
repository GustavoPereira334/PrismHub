import test from 'node:test';
import assert from 'node:assert/strict';
import { PacketDecoder, parseController, encodeColorUpdate } from '../src/modules/openrgbProtocol.js';
import { descriptor, frame, u32 } from './helpers/openrgb-fixtures.js';

test('decodes fragmented headers and multiple frames without losing boundaries',()=>{
  const decoder=new PacketDecoder();const bytes=Buffer.concat([frame(40,0,u32(5)),frame(0,0,u32(2))]);
  assert.deepEqual(decoder.push(bytes.subarray(0,9)),[]);
  const packets=decoder.push(bytes.subarray(9));assert.deepEqual(packets.map(p=>p.id),[40,0]);assert.equal(packets[0].payload.readUInt32LE(),5);
});
test('rejects wrong magic and oversized frames before buffering their bodies',()=>{
  assert.throws(()=>new PacketDecoder().push(Buffer.from('WRONG_HEADER_1234')),/ORGB/);
  const header=frame(0);header.writeUInt32LE(8*1024*1024+1,12);assert.throws(()=>new PacketDecoder().push(header),/limite/);
});
test('parses v3 capability data including modes, zones and LEDs',()=>{
  const c=parseController(descriptor(),7);assert.equal(c.index,7);assert.equal(c.name,'Test motherboard');assert.equal(c.supportsStatic,true);assert.equal(c.colorCount,2);assert.equal(c.zones[0].ledCount,2);
  assert.equal(parseController(descriptor({direct:false}),0).supportsStatic,false);
});
test('rejects truncated, inconsistent and oversized nested descriptions',()=>{
  const d=descriptor();assert.throws(()=>parseController(d.subarray(0,-1),0));
  const bad=Buffer.from(d);bad.writeUInt16LE(65535,8);assert.throws(()=>parseController(bad,0));
  const trailing=Buffer.concat([d,Buffer.from([0])]);assert.throws(()=>parseController(trailing,0));
});
test('encodes a literal RGB color update with SDK size, count and padding',()=>{
  assert.deepEqual([...encodeColorUpdate(2,[0x11,0x22,0x33])],[14,0,0,0,2,0,17,34,51,0,17,34,51,0]);
  assert.throws(()=>encodeColorUpdate(65536,[0,0,0]));
});
