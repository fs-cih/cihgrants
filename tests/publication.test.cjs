const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function context() {
  const makeDialog = () => ({ controls: [{disabled:false}, {disabled:true}],
    querySelectorAll() { return this.controls; }, setAttribute() {}, removeAttribute() {},
    addEventListener(type, fn) { this[type] = fn; } });
  const adminDialog = makeDialog(), prospectDialog = makeDialog();
  const status = {style:{}, children:[], replaceChildren(){this.children=[];}, appendChild(x){this.children.push(x);}};
  let timer, cleared;
  const c = vm.createContext({ els:{adminDialog, prospectDialog, publicationStatus:status},
    document:{createElement:()=>({})}, setTimeout:(fn,ms)=>{timer={fn,ms};return timer;},
    clearTimeout:id=>{cleared=id;}, mutationQueue:Promise.resolve(), queuedMutations:0 });
  vm.runInContext(source.slice(source.indexOf('let publicationStatusTimer;'), source.indexOf('async function loadData')), c);
  return {c, status, adminDialog, prospectDialog, timer:()=>timer, cleared:()=>cleared};
}
test('success overlay expires at 10s and a newer error cancels expiry',()=>{
  const x=context(); x.c.showPublicationStatus('success','old text','https://example.com');
  assert.equal(x.status.children[0].textContent,'Published successfully.');
  assert.equal(x.status.children.length,1); assert.equal(x.timer().ms,10000);
  x.timer().fn(); assert.equal(x.status.hidden,true);
  const old=x.timer(); x.c.showPublicationStatus('error','Failed','https://example.com');
  assert.equal(x.cleared(),old); assert.equal(x.status.hidden,false);
  assert.equal(x.status.children.length,2);
});
test('queue locks forms, rejects duplicate clicks, survives failure, and restores controls',async()=>{
  const x=context(); const status=d=>({closest:()=>d});
  let release; const pending=new Promise(resolve=>release=resolve); const order=[];
  const first=x.c.enqueueMutation(async()=>{order.push(1);await pending;throw Error('failure');},status(x.adminDialog));
  first.catch(()=>{});
  await x.c.enqueueMutation(()=>{throw Error('duplicate ran');},status(x.adminDialog));
  const second=x.c.enqueueMutation(()=>{order.push(2);},status(x.prospectDialog));
  assert.ok(x.adminDialog.controls.every(c=>c.disabled));
  let prevented=false; x.adminDialog.cancel({preventDefault(){prevented=true;}}); assert.ok(prevented);
  await Promise.resolve(); assert.deepEqual(order,[1]); release();
  await assert.rejects(first,/failure/); await second; await x.c.mutationQueue;
  assert.deepEqual(order,[1,2]); assert.deepEqual(x.adminDialog.controls.map(c=>c.disabled),[false,true]);
});
test('agency full names use the existing display mapping',()=>{
  const c=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('const NIH_ABBREVIATIONS'),source.indexOf('// These thresholds')),c);
  vm.runInContext(source.slice(source.indexOf('function getAgencyDisplayName'),source.indexOf('function matchesAgencyName')),c);
  for(const [key,value] of Object.entries({OJJDP:'Office of Juvenile Justice and Delinquency Prevention',OJP:'Office of Justice Programs',OVW:'Office on Violence Against Women',COPS:'Office of Community Oriented Policing Services'})) assert.equal(c.getAgencyDisplayName(key),value);
});
