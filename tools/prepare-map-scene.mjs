/**
 * Private offline mapper. Inputs: local Unity mosaic manifest, a curated scene
 * spec, optional private reference IR with pins, and optional explicit scene
 * extraction manifest. No network or asset copy.
 * `node tools/prepare-map-scene.mjs manifest.json spec.json output.json [pins-ir.json] [scene-manifest.json]`
 * The output is a V14-importable IR, not a module or redistributed artwork.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const digest = x => createHash('sha256').update(x).digest('hex');
const finite = x => typeof x === 'number' && Number.isFinite(x);
function point(p) {
  if (!p || !finite(p.x) || !finite(p.y)) throw new Error('Ponto x/y inválido.');
  return p;
}
function assetPath(path) {
  if (typeof path !== 'string' || !/\.(png|webp|jpe?g)$/i.test(path) ||
      path.startsWith('/') || /[\\%?#\x00-\x1f]/.test(path) ||
      path.split('/').some(p => !p || p === '.' || p === '..') ||
      /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error('Imagem: caminho relativo inseguro ao UserData.');
  return path;
}
function solve3(matrix, vector) {
  const A = matrix.map((row,i) => [...row, vector[i]]);
  for (let j = 0; j < 3; j++) {
    let pivot = j;
    for (let k = j+1; k < 3; k++) if (Math.abs(A[k][j]) > Math.abs(A[pivot][j])) pivot = k;
    if (Math.abs(A[pivot][j]) < 1e-10) throw new Error('Pontos de calibração degenerados.');
    [A[j], A[pivot]] = [A[pivot], A[j]];
    const v = A[j][j];
    for (let k = j; k < 4; k++) A[j][k] /= v;
    for (let i = 0; i < 3; i++) if (i !== j) {
      const m = A[i][j];
      for (let k = j; k < 4; k++) A[i][k] -= m*A[j][k];
    }
  }
  return A.map(row => row[3]);
}
export function fitAffine(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 3 || pairs.length > 1000) throw new Error('São necessários de 3 a 1000 pares de calibração.');
  const rows = pairs.map(pair => {point(pair.source);point(pair.target);return pair;});
  const cx = rows.reduce((s,p) => s+p.source.x, 0)/rows.length;
  const cy = rows.reduce((s,p) => s+p.source.y, 0)/rows.length;
  const scale = Math.max(...rows.map(p=>Math.max(Math.abs(p.source.x-cx),Math.abs(p.source.y-cy))));
  if (!finite(scale) || scale < 1e-10) throw new Error('Pontos de origem insuficientes.');
  const mat = Array.from({length:3},()=>[0,0,0]), vx=[0,0,0], vy=[0,0,0];
  for (const p of rows) {
    const r = [(p.source.x-cx)/scale, (p.source.y-cy)/scale, 1];
    for(let i=0;i<3;i++) {vx[i]+=r[i]*p.target.x;vy[i]+=r[i]*p.target.y;
      for(let j=0;j<3;j++) mat[i][j]+=r[i]*r[j];}
  }
  const a=solve3(mat,vx), b=solve3(mat,vy);
  const coefficients=[a[0]/scale,a[1]/scale,a[2]-a[0]*cx/scale-a[1]*cy/scale,
    b[0]/scale,b[1]/scale,b[2]-b[0]*cx/scale-b[1]*cy/scale];
  const errors=rows.map(p=>{const x=transform(p.source,coefficients);return Math.hypot(x.x-p.target.x,x.y-p.target.y);});
  return {coefficients,rmsError:Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/errors.length),maxError:Math.max(...errors)};
}
export function transform(pointValue,m) {
  const p=point(pointValue);
  if (!Array.isArray(m) || m.length!==6 || !m.every(finite)) throw new Error('Matriz afim inválida.');
  return {x:m[0]*p.x+m[1]*p.y+m[2],y:m[3]*p.x+m[4]*p.y+m[5]};
}

export function prepareScene(manifest, spec, reference = null, now = new Date().toISOString(), sceneManifest = null) {
  if (!manifest || !spec || manifest.mosaic?.layer !== 'BKG') throw new Error('Manifesto de mosaico BKG exigido.');
  const {width,height,area} = manifest.mosaic;
  if (![width,height].every(x => Number.isInteger(x) && x > 0 && x <= 100000) || typeof area !== 'string') throw new Error('Dimensões ou área inválidas.');
  if (typeof spec.name !== 'string' || !spec.name.trim()) throw new Error('Nome da cena obrigatório.');
  const image = assetPath(spec.image);
  if (!spec.area || spec.area !== area) throw new Error('A área no spec deve coincidir exatamente com o manifesto Unity.');
  const sceneId = spec.sourceSceneId;
  if (sceneId !== undefined && (typeof sceneId !== 'string' || !/^AR_\d{4}_[A-Za-z0-9_]+$/.test(sceneId))) throw new Error('Identificador original da cena Unity inválido.');
  const mapId = sceneId ? `poe:map:scene:${sceneId}` : `poe:map:${area}`;
  const bundleId = `poe:scene-bundle:${area}`;
  const identity = manifest.source?.sha256;
  if (typeof identity !== 'string' || !/^[0-9a-f]{64}$/i.test(identity)) throw new Error('Manifesto sem hash SHA256 da origem.');
  const base = {source: 'local-unity-extraction', sourceId: sceneId ?? area, sha256: identity.toLowerCase(), extractedAt: now, status: 'converted', redistribution: false};
  const mapData = {image,width,height,grid: {type:0,size:100,distance:5,units:'ft'},
    combatValidated:false,orientationValidated:false,
    calibration:{status:'pending',kind:'none',source:'no-verified-control-points'}};
  mapData.assetAreaId = area;
  if (sceneId) mapData.sourceSceneId = sceneId;
  mapData.sourceAsset = {
    layer: 'BKG',
    selectionType: manifest.mosaic.selectionType ?? 'unverified',
    gridExtent: Array.isArray(manifest.mosaic.explicitGridExtent) ? [...manifest.mosaic.explicitGridExtent] : null,
    excludedTileCount: Number.isInteger(manifest.mosaic.excludedTileCount) ? manifest.mosaic.excludedTileCount : (manifest.mosaic.unselectedTiles?.length ?? 0),
    sourceCoverageComplete: manifest.mosaic.sourceCoverageComplete === true,
    coverageStatus: manifest.mosaic.sourceCoverageComplete === true ? 'complete' : manifest.mosaic.sourceCoverageComplete === false ? 'incomplete' : 'unverified',
    selectedTileCount: Array.isArray(manifest.mosaic.tiles) ? manifest.mosaic.tiles.length : 0,
    unselectedTileCount: Array.isArray(manifest.mosaic.unselectedTiles) ? manifest.mosaic.unselectedTiles.length : 0,
    rowOrigin: manifest.mosaic.rowOrigin ?? 'unverified',
    orientationValidated: manifest.mosaic.orientationValidated === true,
    assembly: manifest.mosaic.assembly ?? 'unverified',
    pngSha256: manifest.mosaic.pngSha256 ?? null,
    webpSha256: manifest.mosaic.webpSha256 ?? null
  };
  if (sceneManifest !== null) {
    const inventory = sceneManifest?.scene?.featureInventory;
    const sceneHash = sceneManifest?.source?.sha256;
    if (!inventory || typeof sceneHash !== 'string' || !/^[0-9a-f]{64}$/i.test(sceneHash)) throw new Error('Manifesto de cena sem inventário ou hash SHA256 válido.');
    mapData.sourceFeatureInventory = {
      sourceHash: sceneHash.toLowerCase(),
      lights: {identified: inventory.lights?.count ?? 0, converted: 0, status: 'pending-review'},
      collisions: {identified: inventory.collisions?.total ?? 0, wallSegmentsConverted: 0, navigationDecoded: inventory.collisions?.navigationDecoded === true, status: 'pending-review'},
      triggers: {identified: inventory.triggers?.total ?? 0, behavioursInterpreted: inventory.triggers?.behavioursInterpreted ?? 0, customFieldsParsed: inventory.triggers?.customFieldsParsed === true, status: 'pending-review'},
      ambientSettings: {identified: inventory.ambientSettings?.renderSettingsCount ?? 0, converted: inventory.ambientSettings?.converted === true},
      redistribution: false
    };
  }
  const entities = [{id:mapId,kind:'map',sourceId:sceneId ?? area,name:{'pt-BR':spec.name},provenance:base,data:mapData}];
  const diagnostics=[];
  if (reference !== null) {
    if (!reference || !Array.isArray(reference.entities)) throw new Error('IR de referência inválido.');
    const pins = reference.entities.filter(e=>e.kind==='pin' && e.data?.mapId===spec.sourceMapId);
    if (!pins.length) throw new Error('Nenhum pino para sourceMapId informado; nada foi inferido.');
    const cal = spec.calibration;
    if (!cal || cal.kind !== 'affine2d' || cal.approvedByGM !== true) throw new Error('Pinos exigem calibração afim revisada e approvedByGM:true.');
    const fit=fitAffine(cal.controlPoints);
    const threshold=cal.maxErrorPx;
    if (!finite(threshold) || threshold <= 0 || fit.maxError > threshold) throw new Error(`Erro máximo ${fit.maxError.toFixed(2)}px excede tolerância declarada ${threshold}.`);
    mapData.calibration={status:'approved-for-notes',kind:'affine2d',rmsError:fit.rmsError,maxError:fit.maxError,controlPointCount:cal.controlPoints.length,combatValidated:false};
    for (const src of pins) {
      const raw=src.data?.sourcePosition ?? src.data?.position;
      const pos=transform(raw,fit.coefficients);
      if (pos.x<0||pos.y<0||pos.x>width||pos.y>height) {
        diagnostics.push({severity:'warning',code:'PIN_OUT_OF_IMAGE',entityId:src.id});
        continue;
      }
      const provenance = {...src.provenance,status:'converted',redistribution:false};
      entities.push({...src,id:`${mapId}:pin:${digest(src.id).slice(0,24)}`,name:src.name,provenance,
        data:{...src.data,mapId,sourcePosition:raw,position:{x:pos.x,y:pos.y},positionCalibrated:true}});
    }
    diagnostics.push({severity:'warning',code:'GM_CALIBRATION_REVIEW',message:'Calibração aprovada pelo GM para marcadores, não para combate/isometria.'});
  }
  return {schemaVersion:'1.0.0',id:bundleId,source:{game:'pillars-of-eternity',language:'pt-BR',extractedAt:now,redistribution:false},entities,diagnostics};
}

/** Combine independently extracted BKG map manifests into one idempotent scene batch. */
export function prepareSceneBatch(config, now = new Date().toISOString()) {
  if (!config || typeof config.bundleId !== 'string' || !config.bundleId.trim() || config.bundleId.length > 256) throw new Error('Identificador estável do lote obrigatório.');
  const folder = config.targetFolder;
  if (!folder || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 100 || folder.type !== 'Scene') throw new Error('Pasta de destino do lote deve ser uma pasta de cenas com nome válido.');
  if (!Array.isArray(config.maps) || config.maps.length < 1 || config.maps.length > 100) throw new Error('O lote deve conter de 1 a 100 mapas.');
  const seen = new Set(), entities = [];
  for (const entry of config.maps) {
    if (!entry || !entry.manifest || !entry.spec || typeof entry.spec.sourceSceneId !== 'string') throw new Error('Cada mapa exige manifesto e ID original da cena Unity.');
    const sceneId = entry.spec.sourceSceneId;
    if (seen.has(sceneId)) throw new Error(`Cena Unity duplicada no lote: ${sceneId}`);
    seen.add(sceneId);
    const mapped = prepareScene(entry.manifest, entry.spec, null, now).entities[0];
    const sort = entry.spec.sort ?? (entities.length + 1) * 1000;
    if (!Number.isSafeInteger(sort) || sort < 0) throw new Error(`Ordem de pasta inválida para a cena ${sceneId}.`);
    mapped.data.sort = sort;
    entities.push(mapped);
  }
  return {
    schemaVersion: '1.0.0', id: config.bundleId,
    source: {game:'pillars-of-eternity',language:'pt-BR',extractedAt:now,redistribution:false,sceneIds:[...seen]},
    targetFolder: {name: folder.name, type:'Scene'}, entities, diagnostics: []
  };
}

async function main(args) {
  if (args[0] === '--batch') {
    if (args.length !== 3) throw new Error('Uso: node tools/prepare-map-scene.mjs --batch configuracao.json saida.json');
    const [configPath, outputPath] = args.slice(1).map(path => resolve(path));
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const manifestPath = path => resolve(path);
    for (const entry of config.maps ?? []) entry.manifest = JSON.parse(await readFile(manifestPath(entry.manifest), 'utf8'));
    const result = prepareSceneBatch(config);
    await writeFile(outputPath, JSON.stringify(result, null, 2)+'\n', {flag:'wx',encoding:'utf8'});
    process.stdout.write(`Lote ${result.entities.length} mapas preparado; pasta ${result.targetFolder.name}; saída privada: ${outputPath}\n`);
    return;
  }
  if (args.length < 3 || args.length > 5) throw new Error('Uso: node tools/prepare-map-scene.mjs manifest.json spec.json saida.json [referencia-ir.json] [manifesto-cena.json] ou --batch configuracao.json saida.json');
  const [manifestPath,specPath,outputPath,referencePath,sceneManifestPath] = args.map(path => path ? resolve(path) : undefined);
  const read = async path=> JSON.parse(await readFile(path,'utf8'));
  const result=prepareScene(await read(manifestPath),await read(specPath),referencePath ? await read(referencePath):null,new Date().toISOString(),sceneManifestPath ? await read(sceneManifestPath):null);
  await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',encoding:'utf8'});
  process.stdout.write(`Mapa ${result.entities[0].name['pt-BR']}: ${result.entities.length-1} pinos calibrados; saída privada: ${outputPath}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
}
