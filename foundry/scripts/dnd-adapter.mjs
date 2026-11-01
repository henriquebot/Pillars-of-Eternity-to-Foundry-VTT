// Clona somente equivalentes escolhidos e aprovados pelo GM em seus compêndios.
// Não contém estatísticas/textos D&D comerciais nem converte fórmulas por palpite.
const MODULE_ID='rpgup-pillars-importer';
const allowedTypes=new Set(['weapon','equipment','consumable','tool','loot','container','feat','spell']);
export async function prepareMappedItem(entity,mapping,{fromUuid,systemId,systemVersion}={}) {
  const pending=reason=>({status:'pending',sourceId:entity?.id??null,reason});
  if(systemId!=='dnd5e'||!/^6\.0\.\d+(?:[-+].*)?$/.test(systemVersion??'')) return pending('Requer sistema dnd5e 6.0.x verificado pelo chamador.');
  if(entity?.kind!=='item'||typeof entity.id!=='string') return pending('Entidade não é item identificável.');
  if(!mapping||mapping.approved!==true||typeof mapping.decision!=='string'||!mapping.decision.trim()) return pending('Correspondência exige decisão e aprovação explícita do mestre.');
  if(typeof mapping.uuid!=='string'||!/^Compendium\.[A-Za-z0-9_.-]+\.Item\.[A-Za-z0-9]+$/.test(mapping.uuid)) return pending('UUID deve apontar a Item de compêndio instalado.');
  if(typeof fromUuid!=='function') return pending('Resolvedor Foundry não está disponível.');
  let original;
  try { original=await fromUuid(mapping.uuid); }
  catch { return pending('Não foi possível resolver o compêndio.'); }
  if(!original||original.documentName!=='Item'||typeof original.toObject!=='function') return pending('Equivalente não encontrado ou não é Item.');
  const data=structuredClone(original.toObject());
  if(!allowedTypes.has(data.type)||!data.system||typeof data.system!=='object') return pending('Tipo ou dados nativos de Item não suportados.');
  const quantity=entity.data?.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000) return pending('Quantidade inválida; exige revisão.');
  for(const key of ['_id','_stats','folder','ownership','pack','sort']) delete data[key];
  // Evita trazer macros/flags de terceiros por uma correspondência de item nativo.
  data.flags={...(data.flags?.dnd5e?{dnd5e:data.flags.dnd5e}:{}),[MODULE_ID]:{
    sourceId:entity.id,conversion:'adapted',mappingUuid:mapping.uuid,decision:mapping.decision,
    originalName:entity.name??{},balanceValidated:false
  }};
  data.system.quantity=quantity;
  return {status:'adapted',sourceId:entity.id,item:data,requiresRuntimeValidation:true};
}
