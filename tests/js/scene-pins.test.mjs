import test from 'node:test';
import assert from 'node:assert/strict';
import {planScenePins,applyScenePins} from '../../foundry/scripts/scene-pins.mjs';
import {stableId} from '../../foundry/scripts/model.mjs';

const M='rpgup-pillars-importer';
class Collection extends Map { [Symbol.iterator]() {return this.values();} }
const bundle={schemaVersion:'1.0.0',id:'test-pins-bundle',source:{game:'pillars-of-eternity'},entities:[
 {id:'map:one',kind:'map',name:{en:'Map'},provenance:{source:'test',sourceId:'map',extractedAt:'2026-11-01T00:00:00Z',status:'manual'},data:{image:'worlds/testing/test.png',width:800,height:600,calibration:{status:'approved-for-notes'}}},
 {id:'pin:npc',kind:'pin',name:{en:'NPC'},provenance:{source:'test',sourceId:'npc',extractedAt:'2026-11-01T00:00:00Z',status:'manual'},data:{mapId:'map:one',position:{x:100,y:200},positionCalibrated:true,category:'npc',description:'Only GM should read this'}}
]};
function embedded(doc,id) {return doc.notes.get(id);}
function doc(data) {return {id:data._id,uuid:'JournalEntry.'+data._id,toObject:()=>structuredClone(data),getFlag:(scope,key)=>data.flags?.[scope]?.[key]};}
async function ctx() {
 const mapKey=await stableId(bundle.id,'map:one');
 const bundleKey=await stableId(bundle.id,'bundle');
 const sceneData={_id:'scene-id',notes:[],flags:{[M]:{import:{entityKey:mapKey,bundleKey}}}};
 const scene={id:'scene-id',notes:new Map(),getFlag:(scope,key)=>sceneData.flags[scope]?.[key],toObject:()=>structuredClone(sceneData),
  getEmbeddedDocument:(type,id)=>scene.notes.get(id),createEmbeddedDocuments:async(type,items)=>{
    assert.equal(type,'Note');
    for(const item of items) {const o=structuredClone(item);scene.notes.set(o._id,doc(o));sceneData.notes.push(o);}
    return items.map(item=>scene.notes.get(item._id));
  }};
 const journals=new Map();
 const context={world:{id:'rpgup-pillars-tests'},user:{isGM:true},i18n:{lang:'en'},scenes:new Collection([[scene.id,scene]]),journal:journals};
 // Map values iterator yields scene as in actual Foundry collection.
 const journalClass={create:async (data)=>{const d=structuredClone(data);journals.set(d._id,doc(d));return journals.get(d._id);}};
 return {context,scene,journalClass};
}
test('first import creates one journal and scene note; second has no writes',async()=>{
 const {context,scene,journalClass}=await ctx();
 let saves=0;
 const first=await planScenePins(bundle,['pin:npc'],context);
 assert.equal(first.jobs.length,1);
 const result=await applyScenePins(first,{context,journalClass,backup:async()=>{saves++;}});
 assert.equal(result.created.length,1);
 assert.equal(saves,1);
 assert.equal(scene.notes.size,1);
 const second=await planScenePins(bundle,['pin:npc'],context);
 const again=await applyScenePins(second,{context,journalClass,backup:async()=>{saves++;}});
 assert.equal(again.unchanged.length,1);
 assert.equal(saves,1);
});
test('manual movement results in conflict, preserving GM edits',async()=>{
 const {context,scene,journalClass}=await ctx();
 await applyScenePins(await planScenePins(bundle,['pin:npc'],context),{context,journalClass,backup:async()=>{}});
 // Replace test object with an explicit persisted edited copy.
 const noteId=[...scene.notes.keys()][0];
 const original=scene.notes.get(noteId).toObject();
 scene.notes.set(noteId,doc({...original,x:300}));
 const plan=await planScenePins(bundle,['pin:npc'],context);
 assert.equal(plan.conflicts.length,1);
 assert.equal(plan.jobs.length,0);
});
test('uncalibrated pins are blocked without writing',async()=>{
 const {context}=await ctx();
 const draft=structuredClone(bundle);
 draft.entities[0].data.calibration.status='pending';
 const plan=await planScenePins(draft,['pin:npc'],context);
 assert.equal(plan.jobs.length,0);
 assert.equal(plan.skipped.length,1);
});
