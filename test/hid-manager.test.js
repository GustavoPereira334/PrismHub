import test from 'node:test';
import assert from 'node:assert/strict';
import { HidManager } from '../src/modules/hidManager.js';

const request={target:'all',color:'#112233',brightness:100,effect:'estatico',speed:55};
test('no native match yields an empty plan for the SDK fallback instead of failing',()=>{
 const manager=new HidManager([]);assert.equal(manager.prepareLighting({...request,target:'keyboard'}).targets.length,0);
});
function registry(calls,{badEffect=false,failSecond=false}={}) {
 return ['mouse','keyboard'].map((target,index)=>({
  id:'fixture-'+target,target,
  adapter:{probe:()=>({adapterId:'fixture-'+target,name:target,vid:'1111',pid:'222'+index,featurePath:'private-path',lightingEffects:badEffect&&index===1?['pulso']:['estatico']})},
  apply:async(_adapter,_device,options)=>{calls.push({target,options});if(index===1&&failSecond)throw Error('disconnected');return {written:10,reports:1};}
 }));
}
test('HID probe exposes capabilities but never writes or exports native paths',()=>{
 const calls=[];const manager=new HidManager(registry(calls));const devices=manager.probe();assert.equal(devices.length,2);assert.equal(calls.length,0);assert.equal('featurePath' in devices[0],false);
});
test('validates every selected HID device before the first write',()=>{
 const calls=[];const manager=new HidManager(registry(calls,{badEffect:true}));assert.throws(()=>manager.prepareLighting(request),/efeito/);assert.equal(calls.length,0);
});
test('HID mouse target never writes the keyboard',async()=>{
 const calls=[];const manager=new HidManager(registry(calls));const results=await manager.applyPrepared(manager.prepareLighting({...request,target:'mouse'}));assert.deepEqual(calls.map(c=>c.target),['mouse']);assert.equal(results[0].id,'fixture-mouse');
});
test('HID partial failure reports already completed devices',async()=>{
 const manager=new HidManager(registry([],{failSecond:true}));await assert.rejects(manager.applyPrepared(manager.prepareLighting(request)),error=>error.completedDevices.length===1&&error.completedDevices[0].id==='fixture-mouse');
});
test('internal-only target does not probe HID hardware',()=>{
 const manager=new HidManager([{id:'fixture',target:'mouse',adapter:{probe:()=>assert.fail('unexpected probe')},apply:async()=>{}}]);assert.equal(manager.prepareLighting({...request,target:'internal'}).targets.length,0);
});

test('cancellation between HID targets prevents the next hardware write',async()=>{
 const calls=[];let cancelled=false;const entries=registry(calls);const apply=entries[0].apply;entries[0].apply=async(...args)=>{const result=await apply(...args);cancelled=true;return result;};
 const manager=new HidManager(entries);await assert.rejects(manager.applyPrepared(manager.prepareLighting(request),{isCancelled:()=>cancelled}),error=>/cancelad/i.test(error.message)&&error.completedDevices.length===1);assert.deepEqual(calls.map(c=>c.target),['mouse']);
});

test('a failed keyboard does not prevent a later independent mouse write',async()=>{
 const calls=[];const entries=registry(calls).reverse();
 entries[0].apply=async()=>{calls.push({target:'keyboard'});throw Error('SK80 response timeout');};
 const manager=new HidManager(entries);
 await assert.rejects(manager.applyPrepared(manager.prepareLighting(request)),error=>{
  assert.deepEqual(calls.map(c=>c.target),['keyboard','mouse']);
  assert.equal(error.completedDevices[0].id,'fixture-mouse');
  assert.equal(error.uncertainDevices[0].id,'fixture-keyboard');
  return true;
 });
});
