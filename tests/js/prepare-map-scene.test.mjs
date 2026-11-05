import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareScene,prepareSceneBatch,fitAffine,transform} from '../../tools/prepare-map-scene.mjs';

const area='AR_0701_Caravan_Encampment';
const manifest={mosaic:{layer:'BKG',area,width:7680,height:5400},source:{sha256:'a'.repeat(64)}};
const config={area,name:'Encampment',image:'worlds/rpgup-pillars-tests/poe-maps/encampment.webp'};
const pinIR={entities:[{id:'reference:pin:odema',kind:'pin',sourceId:'odema',name:{en:'Odema'},provenance:{source:'https://example.org/',sourceId:'odema',extractedAt:'2026-11-01T00:00:00Z',status:'converted'},data:{mapId:'ref:encampment',sourcePosition:{x:20,y:30},category:'npc',description:'Marker reference'}}]};
const calibration={kind:'affine2d',approvedByGM:true,maxErrorPx:2,controlPoints:[
  {source:{x:0,y:0},target:{x:100,y:200}},
  {source:{x:100,y:0},target:{x:300,y:200}},
  {source:{x:0,y:100},target:{x:100,y:500}},
  {source:{x:100,y:100},target:{x:300,y:500}}
]};
test('map only includes provenance and gridless background, does not pretend combat ready',()=>{
 const r=prepareScene(manifest,config,null,'2026-11-01T00:00:00Z');
 assert.equal(r.entities.length,1);
 assert.equal(r.entities[0].data.width,7680);
 assert.equal(r.entities[0].data.calibration.status,'pending');
 assert.equal(r.entities[0].data.combatValidated,false);
});
test('scene source coverage is carried without claiming unknown completeness',()=>{
 const m={...manifest,mosaic:{...manifest.mosaic,selectionType:'explicit-base-grid',explicitGridExtent:[6,10],excludedTileCount:60,sourceCoverageComplete:false,tiles:Array.from({length:60}),unselectedTiles:Array.from({length:60}),rowOrigin:'bottom',orientationValidated:false}};
 const r=prepareScene(m,{...config,sourceSceneId:'AR_0705_Gilded_Vale'});
 assert.equal(r.entities[0].sourceId,'AR_0705_Gilded_Vale');
 assert.equal(r.entities[0].data.sourceSceneId,'AR_0705_Gilded_Vale');
 assert.equal(r.entities[0].data.sourceAsset.coverageStatus,'incomplete');
 assert.equal(r.entities[0].data.sourceAsset.selectionType,'explicit-base-grid');
 assert.deepEqual(r.entities[0].data.sourceAsset.gridExtent,[6,10]);
 assert.equal(r.entities[0].data.sourceAsset.selectedTileCount,60);
 assert.equal(r.entities[0].data.sourceAsset.unselectedTileCount,60);
 assert.equal(r.entities[0].data.sourceAsset.excludedTileCount,60);
 assert.equal(r.entities[0].data.sourceAsset.orientationValidated,false);
});
test('batch uses stable original scene IDs, one folder, and map-only entities',()=>{
 const entries=[
  {manifest,spec:{...config,sourceSceneId:'AR_0701_Encampment'}},
  {manifest:{...manifest,mosaic:{...manifest.mosaic,area:'AR_0702_Ruin_Int',width:9600},source:{sha256:'b'.repeat(64)}},spec:{name:'Cilant Lîs Interior',area:'AR_0702_Ruin_Int',image:'worlds/rpgup-pillars-tests/poe-maps/cilant-interior.webp',sourceSceneId:'AR_0702_Ruin_Interior'}}
 ];
 const result=prepareSceneBatch({bundleId:'poe:prologue:maps:v1',targetFolder:{name:'Pillars of Eternity — Prólogo',type:'Scene'},maps:entries},'2026-11-03T00:00:00Z');
 assert.equal(result.id,'poe:prologue:maps:v1');
 assert.deepEqual(result.targetFolder,{name:'Pillars of Eternity — Prólogo',type:'Scene'});
 assert.deepEqual(result.entities.map(e=>e.id),['poe:map:scene:AR_0701_Encampment','poe:map:scene:AR_0702_Ruin_Interior']);
 assert.deepEqual(result.entities.map(e=>e.data.sort),[1000,2000]);
 assert.ok(result.entities.every(e=>e.kind==='map'));
 assert.deepEqual(result.source.sceneIds,['AR_0701_Encampment','AR_0702_Ruin_Interior']);
 assert.throws(()=>prepareSceneBatch({bundleId:'batch',targetFolder:{name:'maps',type:'Scene'},maps:[...entries,entries[0]]}),/duplicada/);
});
test('partial scene batches can retain existing folder ordering',()=>{
 const maps=[
  {manifest,spec:{...config,sourceSceneId:'AR_0704_Valewood',sort:4000}},
  {manifest:{...manifest,mosaic:{...manifest.mosaic,area:'AR_0705_Gilded_Vale'},source:{sha256:'b'.repeat(64)}},spec:{...config,name:'Gilded Vale',area:'AR_0705_Gilded_Vale',sourceSceneId:'AR_0705_Gilded_Vale',sort:6000}}
 ];
 const r=prepareSceneBatch({bundleId:'partial',targetFolder:{name:'maps',type:'Scene'},maps});
 assert.deepEqual(r.entities.map(e=>e.data.sort),[4000,6000]);
 assert.throws(()=>prepareSceneBatch({bundleId:'partial',targetFolder:{name:'maps',type:'Scene'},maps:[{...maps[0],spec:{...maps[0].spec,sort:-1}}]}),/Ordem de pasta inválida/);
});
test('scene feature inventory is carried with provenance while all conversions stay pending',()=>{
 const sceneManifest={source:{sha256:'b'.repeat(64)},scene:{featureInventory:{lights:{count:2},collisions:{total:90,navigationDecoded:false},triggers:{total:22,behavioursInterpreted:0,customFieldsParsed:false},ambientSettings:{renderSettingsCount:1}}}};
 const r=prepareScene(manifest,config,null,'2026-11-01T00:00:00Z',sceneManifest);
 const inventory=r.entities[0].data.sourceFeatureInventory;
 assert.equal(inventory.sourceHash,'b'.repeat(64));
 assert.deepEqual(inventory.lights,{identified:2,converted:0,status:'pending-review'});
 assert.deepEqual(inventory.collisions,{identified:90,wallSegmentsConverted:0,navigationDecoded:false,status:'pending-review'});
 assert.deepEqual(inventory.triggers,{identified:22,behavioursInterpreted:0,customFieldsParsed:false,status:'pending-review'});
 assert.equal(inventory.ambientSettings.converted,false);
});
test('pins require GM approved affine control points',()=>{
 assert.throws(()=>prepareScene(manifest,{...config,sourceMapId:'ref:encampment'},pinIR),/calibração afim/);
});
test('calibrated pins retain original coordinates and map reference',()=>{
 const r=prepareScene(manifest,{...config,sourceMapId:'ref:encampment',calibration},pinIR);
 assert.equal(r.entities.length,2);
 assert.equal(r.entities[0].data.calibration.status,'approved-for-notes');
 assert.equal(r.entities[1].data.positionCalibrated,true);
 assert.ok(Math.abs(r.entities[1].data.position.x-140)<1e-8);
 assert.ok(Math.abs(r.entities[1].data.position.y-290)<1e-8);
 assert.deepEqual(r.entities[1].data.sourcePosition,{x:20,y:30});
});
test('affine handles non-axis aligned points',()=>{
 const pairs=[{source:{x:0,y:0},target:{x:5,y:10}},
 {source:{x:1,y:0},target:{x:7,y:7}},{source:{x:0,y:1},target:{x:9,y:16}}];
 const f=fitAffine(pairs);
 const p=transform({x:2,y:3},f.coefficients);
 assert.ok(Math.abs(p.x-21)<1e-8);
 assert.ok(Math.abs(p.y-22)<1e-8);
});
test('invalid source info and malicious image are rejected',()=>{
 assert.throws(()=>prepareScene({...manifest,mosaic:{...manifest.mosaic,area:'OTHER'}},config),/área/);
 assert.throws(()=>prepareScene(manifest,{...config,image:'../secret.webp'}),/Imagem/);
});
