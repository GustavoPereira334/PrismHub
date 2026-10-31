import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HardwareService } from '../src/hardware/hardware-service.js';
import { HidManager } from '../src/modules/hidManager.js';
import { AttackSharkX11Adapter } from '../src/hardware/adapters/attack-shark-x11.js';
import { WomierSK80Adapter } from '../src/hardware/adapters/womier-sk80.js';
import { FuryCubeG11Adapter } from '../src/hardware/adapters/furycube-g11.js';

// Guard the RED run against legacy constructors that do not yet accept dependency injection.
for (const Adapter of [AttackSharkX11Adapter, WomierSK80Adapter, FuryCubeG11Adapter]) {
  mock.method(Adapter.prototype, 'probe', () => null);
  mock.method(Adapter.prototype, 'applyLighting', () => assert.fail('A service test must never write real hardware'));
}

const request={target:'all',color:'#112233',brightness:100,effect:'estatico',speed:55};
const board={index:0,type:0,name:'Board',vendor:'Vendor',supportsStatic:true,zones:[{name:'ARGB',ledCount:3}],ledCount:3};

test('mouse settings fail closed without probes, SDK connections or native writes', async () => {
  const deps = dependencies();
  deps.hidManager.probe = () => assert.fail('Must not probe');
  deps.openrgb.refresh = () => assert.fail('Must not connect');
  const service = new HardwareService(deps);
  for (const setting of [{ dpi: 1600 }, { pollingRate: 1000 }, { profileSlot: 0 }]) {
    await assert.rejects(service.applyMouseSettings({ deviceId: 'hid:furycube-g11', ...setting }), error => error.code === 'ERR_UNSUPPORTED_CAPABILITY');
  }
  assert.equal(service.status().apiVersion, 1);
  assert.deepEqual(service.status().mouseControls, { dpi: false, pollingRate: false, onboardProfiles: false });
  assert.deepEqual(deps.calls, []);
});

test('lists SDK keyboard fallback and forwards native ownership to preflight',async()=>{
 const deps=dependencies();const keyboard={...board,index:1,type:5,name:'SDK keyboard'};deps.openrgb.refresh=async()=>[board,keyboard];let policy;
 deps.openrgb.prepareLighting=(r,p)=>{policy=p;return {controllers:r.target==='mouse'?[]:[keyboard]};};
 const s=new HardwareService(deps);const list=await s.refresh();assert.equal(list.find(d=>d.name==='SDK keyboard')?.lightingTarget,'keyboard');
 await s.applyLighting({...request,target:'all'});assert.deepEqual(policy.excludeTargets,['mouse']);
});
test('native mouse ownership prevents SDK mouse discovery from advertising a second route',async()=>{
 const deps=dependencies();deps.openrgb.refresh=async()=>[{...board,type:6,name:'SDK mouse'}];const s=new HardwareService(deps);const list=await s.refresh();assert.equal(list.some(d=>d.name==='SDK mouse'),false);
});
test('keyboard without any native adapter applies through SDK only and invalidation removes support',async()=>{
 const deps=dependencies();deps.hidManager=new HidManager([]);const keyboard={...board,type:5,name:'Fallback keyboard'};
 deps.openrgb.refresh=async()=>[keyboard];deps.openrgb.prepareLighting=(r,p)=>{assert.equal(r.target,'keyboard');assert.deepEqual(p.excludeTargets,[]);return {controllers:[keyboard]};};
 const service=new HardwareService(deps);await service.refresh();assert.equal(service.list()[0].lightingTarget,'keyboard');const result=await service.applyLighting({...request,target:'keyboard'});assert.equal(result.sent,1);assert.deepEqual(deps.calls,['sdk']);
 deps.openrgb.emit('devices-updated',[]);assert.equal(service.list().length,0);
});
test('unknown Windows HID remains detected-only and cannot receive speculative writes',async()=>{
 const deps=dependencies();deps.hidManager=new HidManager([]);deps.discover=async()=>[{id:'unknown',name:'Unknown mouse',category:'input',state:'detected',capabilities:{lighting:false}}];deps.openrgb.refresh=async()=>[];deps.openrgb.prepareLighting=()=>({controllers:[]});
 const service=new HardwareService(deps);assert.equal((await service.refresh())[0].capabilities.lighting,false);await assert.rejects(service.applyLighting({...request,target:'mouse'}),/Nenhum dispositivo/);assert.deepEqual(deps.calls,[]);
});
function dependencies({sdkFail=false,hidFail=false,unsupportedEffect=false}={}) {
 const calls=[];
 const hidManager={probe:()=>[{adapterId:'furycube-g11',name:'FuryCube G11',vid:'1D57',pid:'FA60',target:'mouse',lightingEffects:['estatico']}],prepareLighting:r=>({targets:r.target==='internal'||r.target==='keyboard'?[]:[{id:'furycube-g11',target:'mouse'}]}),applyPrepared:async()=>{calls.push('hid');if(hidFail)throw Error('HID unavailable');return [{id:'furycube-g11',name:'G11',reports:2,responses:0,written:268}];}};
 const openrgb=Object.assign(new EventEmitter(),{status:()=>({state:sdkFail?'unavailable':'connected',message:sdkFail?'offline':'online'}),listControllers:()=>[board],refresh:async()=>{if(sdkFail)throw Error('SDK offline');return [board];},prepareLighting:r=>{if(unsupportedEffect&&r.effect!=='estatico')throw Error('SDK apenas estático');return {controllers:[{index:0,name:'Board'}]};},applyPrepared:async()=>{calls.push('sdk');return [{id:'openrgb:0',name:'Board',reports:2,responses:0,written:50,confirmation:'transport-accepted'}];},disconnect:()=>{}});
 return {calls,hidManager,openrgb,discover:async()=>[]};
}
test('merges real HID probes and internal SDK capabilities in discovery',async()=>{
 const deps=dependencies();const s=new HardwareService(deps);const devices=await s.refresh();assert.equal(devices.length,2);assert.equal(devices.find(d=>d.connection==='openrgb').category,'internal');assert.equal(deps.calls.length,0);
});
test('SDK failure does not remove HID devices or disable mouse control',async()=>{
 const deps=dependencies({sdkFail:true});const s=new HardwareService(deps);assert.equal((await s.refresh()).length,1);const result=await s.applyLighting({...request,target:'mouse'});assert.equal(result.sent,1);assert.deepEqual(deps.calls,['hid']);assert.equal(s.status().openrgb.state,'unavailable');
});
test('native-only destination never opens SDK or retries it after native failure',async()=>{
 const deps=dependencies({hidFail:true});deps.openrgb.refresh=()=>assert.fail('Native mouse must not depend on SDK');
 await assert.rejects(new HardwareService(deps).applyLighting({...request,target:'mouse'}),/HID unavailable/);assert.deepEqual(deps.calls,['hid']);
});
test('all validates SDK support before any HID write',async()=>{
 const deps=dependencies({unsupportedEffect:true});await assert.rejects(new HardwareService(deps).applyLighting({...request,effect:'pulso'}),/estático/);assert.deepEqual(deps.calls,[]);
});
test('internal-only target does not apply any peripheral color',async()=>{
 const deps=dependencies();const result=await new HardwareService(deps).applyLighting({...request,target:'internal'});assert.equal(result.sent,1);assert.deepEqual(deps.calls,['sdk']);
});
test('all returns an explicit warning when SDK is unavailable',async()=>{
 const deps=dependencies({sdkFail:true});const result=await new HardwareService(deps).applyLighting(request);assert.equal(result.sent,1);assert.equal(result.warnings.length,1);
});
test('reports partial results when SDK fails after HID accepted a write',async()=>{
 const deps=dependencies();deps.openrgb.applyPrepared=async()=>{throw Error('SDK lost connection');};const result=await new HardwareService(deps).applyLighting(request);assert.equal(result.partial,true);assert.equal(result.sent,1);assert.equal(result.errors[0].provider,'openrgb');
});
test('device-list invalidation immediately removes stale SDK capabilities',async()=>{
 const deps=dependencies();const s=new HardwareService(deps);await s.refresh();deps.openrgb.emit('devices-updated',[]);assert.equal(s.list().some(d=>d.connection==='openrgb'),false);
});
test('rejects malformed requests before native probes or socket calls',async()=>{
 const deps=dependencies();deps.hidManager.prepareLighting=()=>assert.fail('native probe');const s=new HardwareService(deps);for(const bad of [null,[],new Date(),{...request,color:'#fff'},{...request,speed:-1},{...request,target:'host'}])await assert.rejects(s.applyLighting(bad));
});

test('stop during SDK preflight cancels application instead of falling back to HID',async()=>{
 const deps=dependencies();let rejectRefresh;let entered;
 const started=new Promise(resolve=>entered=resolve);
 deps.openrgb.refresh=()=>{entered();return new Promise((_resolve,reject)=>rejectRefresh=reject);};
 const service=new HardwareService(deps);const operation=service.applyLighting(request);await started;service.stop();rejectRefresh(Error('SDK disconnected'));
 await assert.rejects(operation,/cancelad/i);assert.deepEqual(deps.calls,[]);
});

test('reports uncertainty even if mode changed but no requested color was completed',async()=>{
 const deps=dependencies();deps.openrgb.applyPrepared=async()=>{const error=Error('Topology changed');error.uncertainDevices=[{id:'openrgb:0',name:'Board',stage:'mode-accepted'}];throw error;};
 const result=await new HardwareService(deps).applyLighting({...request,target:'internal'});assert.equal(result.sent,0);assert.equal(result.partial,true);assert.equal(result.uncertainDevices[0].name,'Board');
});

test('a HID device failure does not suppress the independent OpenRGB provider',async()=>{
 const deps=dependencies();deps.hidManager.applyPrepared=async()=>{
  deps.calls.push('hid');const error=Error('SK80 response timeout');error.completedDevices=[];error.uncertainDevices=[{id:'womier-sk80',name:'Womier SK80',stage:'write-pending'}];throw error;
 };
 const result=await new HardwareService(deps).applyLighting(request);
 assert.deepEqual(deps.calls,['hid','sdk']);assert.equal(result.sent,1);assert.equal(result.devices[0].id,'openrgb:0');assert.equal(result.partial,true);assert.equal(result.uncertainDevices[0].id,'womier-sk80');
});
