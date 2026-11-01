import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBundle} from '../../foundry/scripts/model.mjs';
import {planImport} from '../../foundry/scripts/importer.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('CLI Python -> pacote compacto -> consumidor Foundry conserva escolhas e mantém conteúdo privado',async()=>{
  const tempBase=resolve(root,'.tmp');await mkdir(tempBase,{recursive:true});
  const folder=await mkdtemp(join(tempBase,'pipeline-'));
  try {
    const game=join(folder,'own-fixture'),data=join(game,'PillarsOfEternity_Data','data');
    await mkdir(join(data,'conversations','test'),{recursive:true});
    await mkdir(join(data,'localized','en','text','conversations','test'),{recursive:true});
    await writeFile(join(game,'.rpgup-synthetic'),'Synthetic test only\n');
    await copyFile(join(root,'tests','python','fixtures','branch.conversation'),join(data,'conversations','test','branch.conversation'));
    await copyFile(join(root,'tests','python','fixtures','branch.stringtable'),join(data,'localized','en','text','conversations','test','branch.stringtable'));
    const full=join(folder,'full.json'),compact=join(folder,'compact.json');
    const cli=args=>execFileSync('python',['-m','rpgup_pillars',...args],{cwd:root,env:{...process.env,PYTHONPATH:join(root,'extractor'),PYTHONUTF8:'1'},encoding:'utf8'});
    cli(['extract','--root',game,'--language','pt-BR','--output',full]);
    cli(['package',full,'--output',compact,'--select-source','conversations/test/*']);
    const bundle=parseBundle(await readFile(compact,'utf8'));
    assert.equal(bundle.source.synthetic,true);assert.equal(bundle.entities.length,1);
    assert.equal(bundle.entities[0].data.nodes[0].links.length,2);
    assert.equal(bundle.entities[0].data.nodes[0].texts['pt-BR'].translationMissing,true);
    assert.equal(bundle.entities[0].data.nodes[0].texts['pt-BR'].language,'en');
    assert.equal(bundle.entities[0].data.nodes[0].scripts[0].executable,false);
    assert.ok(!bundle.source.tables);assert.ok(!bundle.entities[0].data.sourceTree);
    const world={user:{isGM:true},world:{id:'synthetic-only'},journal:new Map(),scenes:new Map(),i18n:{lang:'pt-BR'}};
    const plan=await planImport(bundle,[bundle.entities[0].id],world);
    assert.equal(plan.actions.length,0);assert.equal(plan.skipped.length,1);
    assert.match(plan.skipped[0].reason,/privado|público/);
  } finally {
    const resolved=resolve(folder);
    assert.ok(resolved.startsWith(tempBase+sep),'Cleanup must remain in workspace temp root');
    await rm(resolved,{recursive:true,force:true});
  }
});
