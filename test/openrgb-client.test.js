import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { OpenRGBClient } from '../src/modules/openrgbClient.js';
import { descriptor, frame, u32 } from './helpers/openrgb-fixtures.js';

async function sdk(t,{drop=false,version=5,malformed=false,ramVersion=null,staticMode=true,deviceType=0}={}) {
  let signalColor;const colorReceived=new Promise(resolve=>signalColor=resolve);const writes=[];const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let bytes=Buffer.alloc(0);
    socket.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=16){const n=bytes.readUInt32LE(12);if(bytes.length<16+n)break;const id=bytes.readUInt32LE(8),device=bytes.readUInt32LE(4),payload=Buffer.from(bytes.subarray(16,16+n));bytes=bytes.subarray(16+n);writes.push({id,device,payload});if(id===1050)signalColor();
      if(drop)continue;
      let reply;
      if(id===40)reply=frame(40,0,u32(version));
      if(id===0)reply=frame(0,0,u32(2));
      if(id===1)reply=frame(1,device,descriptor({type:device===0?deviceType:5,name:device===0?'Board':'Keyboard',ramVersion:device===0?ramVersion:null,staticMode}));
      if(reply){if(malformed){reply=Buffer.from('bad protocol frame');}socket.write(reply.subarray(0,7));setImmediate(()=>{if(!socket.destroyed)socket.write(reply.subarray(7));});}
    }});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
  const client=new OpenRGBClient({port:server.address().port,timeoutMs:100});t.after(()=>client.disconnect());
  return {client,writes,sockets,colorReceived};
}
const request={target:'internal',effect:'estatico',color:'#112233',brightness:100,speed:55};

test('cancellation before a queued SDK write sends no mode or color commands', async t => {
  const { client, writes } = await sdk(t);
  await client.refresh();
  await assert.rejects(client.applyPrepared(client.prepareLighting(request), { isCancelled: () => true }), /cancelad/i);
  assert.equal(writes.some(w => w.id >= 1000), false);
});

test('cancellation after SDK mode acceptance reports uncertainty without sending color', async t => {
  const { client, writes } = await sdk(t);
  await client.refresh();
  let checks = 0;
  await assert.rejects(client.applyPrepared(client.prepareLighting(request), { isCancelled: () => ++checks > 1 }), error => {
    assert.equal(error.uncertainDevices[0].stage, 'mode-accepted');
    assert.equal(error.completedDevices.length, 0);
    return /cancelad/i.test(error.message);
  });
  assert.equal(writes.some(w => w.id === 1050), false);
});

test('routes mouse fallback without touching keyboard or internal components',async t=>{
 const {client,writes,colorReceived}=await sdk(t,{deviceType:6});await client.refresh();const plan=client.prepareLighting({...request,target:'mouse'});assert.equal(plan.controllers.length,1);await client.applyPrepared(plan);await colorReceived;assert.deepEqual(writes.filter(w=>w.id>=1000).map(w=>w.device),[0,0]);
});
test('native keyboard ownership excludes SDK keyboard from all and targeted plans',async t=>{
 const {client}=await sdk(t);await client.refresh();assert.equal(client.prepareLighting({...request,target:'all'},{excludeTargets:['keyboard']}).controllers.length,1);assert.equal(client.prepareLighting({...request,target:'keyboard'},{excludeTargets:['keyboard']}).controllers.length,0);
});
test('SDK keyboard fallback is available without a native adapter and unknown types are ignored',async t=>{
 const {client}=await sdk(t,{deviceType:99});await client.refresh();assert.equal(client.prepareLighting({...request,target:'keyboard'}).controllers.length,1);assert.equal(client.prepareLighting({...request,target:'all'}).controllers.length,1);
});

test('uses advertised Static mode for physically verified ENE RAM revision',async t=>{
 const {client,writes,colorReceived}=await sdk(t,{ramVersion:'AUDA0-E6K5-0101'});await client.refresh();await client.applyPrepared(client.prepareLighting(request));await colorReceived;
 const commands=writes.filter(w=>w.id>=1000);assert.deepEqual(commands.map(w=>w.id),[1101,1050]);
 // SDK3 size, advertised mode index, name, value, flags, untouched parameters, per-LED color mode, zero mode colors.
 const name=Buffer.from('Static\0');const len=Buffer.alloc(2);len.writeUInt16LE(name.length);
 const expected=Buffer.concat([u32(67),u32(1),len,name,u32(1),u32(32),...Array.from({length:9},()=>u32(0)),u32(1),Buffer.alloc(2)]);
 assert.deepEqual(commands[0].payload,expected);assert.equal(commands[1].payload[8],0x33);
});

test('keeps Direct mode for unverified ENE revisions',async t=>{
 const {client,writes,colorReceived}=await sdk(t,{ramVersion:'different-revision'});await client.refresh();await client.applyPrepared(client.prepareLighting(request));await colorReceived;
 assert.deepEqual(writes.filter(w=>w.id>=1000).map(w=>w.id),[1100,1050]);
});

test('rejects verified ENE revision without advertised Static mode before writing',async t=>{
 const {client,writes}=await sdk(t,{ramVersion:'AUDA0-E6K5-0101',staticMode:false});await client.refresh();assert.throws(()=>client.prepareLighting(request),/Static/);assert.equal(writes.some(w=>w.id>=1000),false);
});

test('negotiates v3 and discovers controllers without changing hardware',async t=>{
 const {client,writes}=await sdk(t);const controllers=await client.refresh();assert.equal(controllers.length,2);assert.equal(client.status().state,'connected');assert.equal(writes[0].payload.readUInt32LE(),3);assert.equal(writes.some(w=>w.id>=1000),false);
});
test('sends Direct and RGB only to internal components, never SDK peripherals',async t=>{
 const {client,writes,colorReceived}=await sdk(t);await client.refresh();const plan=client.prepareLighting(request);const result=await client.applyPrepared(plan);await colorReceived;
 assert.equal(result.length,1);assert.equal(result[0].confirmation,'transport-accepted');const commands=writes.filter(w=>w.id>=1000);assert.deepEqual(commands.map(w=>[w.id,w.device]),[[1100,0],[1050,0]]);assert.deepEqual([...commands[1].payload],[14,0,0,0,2,0,17,34,51,0,17,34,51,0]);
});
test('invalidates indices immediately on device-list change and rejects stale plans',async t=>{
 const {client,sockets,writes}=await sdk(t);await client.refresh();const plan=client.prepareLighting(request);const changed=new Promise(resolve=>client.once('devices-updated',resolve));for(const socket of sockets)socket.write(frame(100));await changed;
 assert.deepEqual(client.listControllers(),[]);await assert.rejects(client.applyPrepared(plan),/mudou|inválid/);assert.equal(writes.some(w=>w.id>=1000),false);
});
test('timeout invalidates the session instead of reusing late replies',async t=>{
 const {client}=await sdk(t,{drop:true});await assert.rejects(client.refresh(),/tempo|resposta/i);assert.notEqual(client.status().state,'connected');assert.deepEqual(client.listControllers(),[]);
});
test('rejects unsupported SDK versions and malformed network data',async t=>{
 const a=await sdk(t,{version:2});await assert.rejects(a.client.refresh(),/versão/i);
 const b=await sdk(t,{malformed:true});await assert.rejects(b.client.refresh(),/ORGB/);
});
test('disconnection removes capabilities and rejects a queued write',async t=>{
 const {client,sockets}=await sdk(t);await client.refresh();const plan=client.prepareLighting(request);for(const socket of sockets)socket.destroy();await new Promise(resolve=>client.once('status',resolve));
 await assert.rejects(client.applyPrepared(plan));assert.deepEqual(client.listControllers(),[]);
});
test('rejects remote hosts and invalid colors before opening a connection',()=>{
 assert.throws(()=>new OpenRGBClient({host:'example.com'}),/local/i);
 const client=new OpenRGBClient();assert.throws(()=>client.prepareLighting({...request,color:'#fff'}));
});

test('disconnect cancels a refresh queued before it can open a socket',async t=>{
 const {client,writes}=await sdk(t);const pending=client.refresh();client.disconnect();await assert.rejects(pending,/cancelad/i);assert.equal(writes.length,0);assert.equal(client.status().state,'disconnected');
});

test('reports an uncertain target if topology changes after Direct-mode acceptance',async t=>{
 const {EventEmitter}=await import('node:events');
 class FakeSocket extends EventEmitter {
   destroyed=false;
   write(bytes,callback){
     const id=bytes.readUInt32LE(8);callback();
     if(id===40)queueMicrotask(()=>this.emit('data',frame(40,0,u32(5))));
     if(id===0)queueMicrotask(()=>this.emit('data',frame(0,0,u32(1))));
     if(id===1)queueMicrotask(()=>this.emit('data',frame(1,0,descriptor())));
     if(id===1100)this.emit('data',frame(100));
     return true;
   }
   destroy(){this.destroyed=true;queueMicrotask(()=>this.emit('close'));}
 }
 t.mock.method(net,'createConnection',()=>{const socket=new FakeSocket();queueMicrotask(()=>socket.emit('connect'));return socket;});
 const client=new OpenRGBClient();t.after(()=>client.disconnect());await client.refresh();const plan=client.prepareLighting(request);
 await assert.rejects(client.applyPrepared(plan),error=>error.completedDevices.length===0&&error.uncertainDevices?.[0]?.id==='openrgb:0'&&error.uncertainDevices[0].stage==='mode-accepted');
});
