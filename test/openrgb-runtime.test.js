import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BundledOpenRGB } from '../src/modules/openrgbRuntime.js';

function fixture(t, { fail = false } = {}) {
 const calls=[];const child=Object.assign(new EventEmitter(),{exitCode:null,killed:false,kill(){this.killed=true;this.exitCode=0;this.emit('exit',0);return true;}});
 const runtime=new BundledOpenRGB({resourcesPath:'C:/Program Files/PrismHub/resources',userDataPath:'C:/Users/Test/PrismHub',allocatePort:async()=>18742,prepareDirectory:async()=>{},spawnProcess:(exe,args,options)=>{calls.push({exe,args,options});queueMicrotask(()=>child.emit(fail?'error':'spawn',fail?new Error('missing engine'):undefined));return child;}});
 t.after(()=>runtime.stop());return {runtime,calls,child};
}
test('starts only the bundled engine with private localhost port and isolated configuration',async t=>{
 const {runtime,calls}=fixture(t);assert.equal(await runtime.start(),18742);await runtime.start();assert.equal(calls.length,1);
 assert.match(calls[0].exe,/resources[\\/]openrgb[\\/]OpenRGB.exe$/);assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);
 assert.deepEqual(calls[0].args.slice(0,7),['--server','--server-host','127.0.0.1','--server-port','18742','--noautoconnect','--config']);assert.match(calls[0].args[7],/rgb-engine$/);
});
test('stops only its owned child and startup remains idempotent',async t=>{
 const {runtime,child}=fixture(t);await runtime.start();runtime.stop();runtime.stop();assert.equal(child.killed,true);
});
test('reports spawn failure and never attaches to external SDK port 6742',async t=>{
 const {runtime,calls}=fixture(t,{fail:true});await assert.rejects(runtime.start(),/missing engine/);assert.equal(calls.length,1);assert.equal(calls[0].args.includes('6742'),false);
});
test('stop during asynchronous startup prevents a late child from being launched',async t=>{
 let release;const wait=new Promise(resolve=>release=resolve);let spawned=false;
 const runtime=new BundledOpenRGB({resourcesPath:'x',userDataPath:'y',allocatePort:()=>wait,prepareDirectory:async()=>{},spawnProcess:()=>{spawned=true;throw Error('late child');}});t.after(()=>runtime.stop());
 const start=runtime.start();runtime.stop();release(18000);await assert.rejects(start,/cancelad/i);assert.equal(spawned,false);
});
