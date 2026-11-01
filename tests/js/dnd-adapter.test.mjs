import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMappedItem} from '../../foundry/scripts/dnd-adapter.mjs';
const entity={id:'own:item',kind:'item',name:{en:'Invented Training Stick'},data:{quantity:2}};
const mapping={approved:true,uuid:'Compendium.own.items.Item.abc123',decision:'GM escolheu equivalente da própria biblioteca'};
const native={_id:'abc123',name:'Training Stick',type:'weapon',system:{quantity:1,activities:{activity:{type:'attack'}}},flags:{untrusted:{macro:'ignore'},dnd5e:{sourceId:'own'}},effects:[]};
const env={systemId:'dnd5e',systemVersion:'6.0.6',fromUuid:async()=>({documentName:'Item',toObject:()=>native})};
test('correspondência conserva atividades nativas sem alterar o original',async()=>{
  const result=await prepareMappedItem(entity,mapping,env);
  assert.equal(result.status,'adapted');assert.equal(result.item.system.quantity,2);
  assert.equal(result.item.system.activities.activity.type,'attack');assert.equal(native.system.quantity,1);
  assert.ok(!('_id' in result.item));assert.ok(!result.item.flags.untrusted);assert.equal(result.requiresRuntimeValidation,true);
});
test('sem aprovação ou equivalente permanece pendente',async()=>{
  assert.equal((await prepareMappedItem(entity,{...mapping,approved:false},env)).status,'pending');
  assert.equal((await prepareMappedItem(entity,mapping,{...env,fromUuid:async()=>null})).status,'pending');
  assert.equal((await prepareMappedItem(entity,mapping,{...env,systemVersion:'6.1.0'})).status,'pending');
});
test('não busca por nome nem aceita UUID de outra classe',async()=>{
  let called=false;
  const result=await prepareMappedItem(entity,{...mapping,uuid:'Compendium.own.actors.Actor.xyz'},{...env,fromUuid:async()=>{called=true;}});
  assert.equal(result.status,'pending');assert.equal(called,false);
});
