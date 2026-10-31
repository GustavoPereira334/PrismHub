import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHardwareIpc } from '../src/modules/ipcHandlers.js';

function setup() {
 const calls=[];const handlers=new Map();
 const frame={url:'file:///C:/PrismHub/src/renderer/index.html'};
 const contents={mainFrame:frame,isDestroyed:()=>false};
 const window={webContents:contents,isDestroyed:()=>false};
 const hardware={list:()=>{calls.push('list');return [];},refresh:async()=>{calls.push('refresh');return [];},status:()=>({openrgb:{state:'connected'}}),applyLighting:async r=>{calls.push(r);return {sent:1};}};
 const ipcMain={handle:(id,fn)=>handlers.set(id,fn),removeHandler:id=>handlers.delete(id)};
 const unregister=registerHardwareIpc({ipcMain,hardware,getWindow:()=>window,documentUrl:frame.url});
 return {calls,handlers,window,frame,contents,unregister,event:{sender:contents,senderFrame:frame}};
}
test('accepts only the trusted local main frame and validates the lighting request',async()=>{
 const x=setup();const result=await x.handlers.get('lighting:apply')(x.event,{target:'internal',color:'#aabbcc',brightness:80,effect:'estatico'});assert.equal(result.sent,1);assert.deepEqual(x.calls[0],{target:'internal',color:'#AABBCC',brightness:80,effect:'estatico',speed:55});
});
test('rejects foreign windows, subframes and wrong documents before touching hardware',()=>{
 const x=setup();for(const event of [{sender:{},senderFrame:x.frame},{sender:x.contents,senderFrame:{...x.frame}},{sender:x.contents,senderFrame:null}])assert.throws(()=>x.handlers.get('devices:list')(event),/origem/i);
 x.frame.url='https://example.com';assert.throws(()=>x.handlers.get('devices:refresh')(x.event),/origem/i);assert.deepEqual(x.calls,[]);
});
test('rejects malformed lighting IPC payloads and removes handlers on teardown',()=>{
 const x=setup();assert.throws(()=>x.handlers.get('lighting:apply')(x.event,{target:'internal',color:'#fff',brightness:100,effect:'estatico'}),/Cor/);assert.deepEqual(x.calls,[]);x.unregister();assert.equal(x.handlers.size,0);
});
