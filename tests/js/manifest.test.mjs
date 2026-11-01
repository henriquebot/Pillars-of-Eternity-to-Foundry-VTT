import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const root=new URL('../../foundry/',import.meta.url);
test('manifesto local referencia arquivos reais e nenhuma URL fictícia',async()=>{
  const m=JSON.parse(await readFile(new URL('module.json',root),'utf8'));
  assert.equal(m.id,'rpgup-pillars-importer');
  assert.equal(m.compatibility.minimum,'14');
  for(const file of [...(m.esmodules??[]),...(m.styles??[]),...(m.languages??[]).map(l=>l.path)]) await access(new URL(file,root));
  for(const field of ['url','manifest','download']) if(m[field])assert.ok(!/example|YOUR_|TODO|localhost/.test(m[field]));
  assert.ok(!(m.relationships?.requires??[]).some(m=>m.id!=='dnd5e'));
});
