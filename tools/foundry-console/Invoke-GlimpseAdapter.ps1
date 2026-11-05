[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Plan', 'Backup', 'Apply', 'Reimport')]
    [string]$Mode,

    [Parameter(Mandatory = $true)]
    [string]$BundlePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$TargetSceneId,

    [string[]]$PinId,
    [string]$BackupPath,
    [string]$ExpectedWorldId = 'rpgup-pillars-tests'
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$privateRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'local')).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$validationRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'local\validation')).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$bundleFullPath = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BundlePath).Path)
if (-not $bundleFullPath.StartsWith($privateRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'O IR precisa permanecer dentro de local/, fora do release público.'
}

if ($Mode -in @('Backup', 'Apply')) {
    if (-not $BackupPath) { throw 'BackupPath é obrigatório para Backup e Apply.' }
    $backupFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $BackupPath))
    if (-not $backupFullPath.StartsWith($validationRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'O backup precisa permanecer em local/validation/.'
    }
    if ($Mode -eq 'Backup' -and (Test-Path -LiteralPath $backupFullPath)) {
        throw 'O caminho do backup já existe; nenhum arquivo será sobrescrito.'
    }
    if ($Mode -eq 'Apply' -and -not (Test-Path -LiteralPath $backupFullPath -PathType Leaf)) {
        throw 'O backup prévio não foi encontrado; nenhuma gravação foi tentada.'
    }
}

$bundleText = [System.IO.File]::ReadAllText($bundleFullPath, [System.Text.Encoding]::UTF8)
$bundle = ConvertFrom-Json -InputObject $bundleText
if (-not $PinId -or $PinId.Count -eq 0) { $PinId = @($bundle.entities | Where-Object kind -eq 'pin' | ForEach-Object id) }
if (-not $PinId -or $PinId.Count -eq 0) { throw 'O IR não contém pins selecionados.' }
$pinText = ConvertTo-Json -InputObject @($PinId) -Depth 10 -Compress
$adapterPath = Join-Path $repoRoot 'foundry\scripts\glimpse-adapter.mjs'
$adapterText = [System.IO.File]::ReadAllText($adapterPath, [System.Text.Encoding]::UTF8)
$backupText = if ($Mode -eq 'Apply') { [System.IO.File]::ReadAllText($backupFullPath, [System.Text.Encoding]::UTF8) } else { '' }
$encode = [System.Text.Encoding]::UTF8
$bundle64 = [Convert]::ToBase64String($encode.GetBytes($bundleText))
$adapter64 = [Convert]::ToBase64String($encode.GetBytes($adapterText))
$pin64 = [Convert]::ToBase64String($encode.GetBytes($pinText))
$backup64 = [Convert]::ToBase64String($encode.GetBytes($backupText))
$modeJson = ConvertTo-Json -InputObject $Mode -Compress
$worldJson = ConvertTo-Json -InputObject $ExpectedWorldId -Compress
$sceneJson = ConvertTo-Json -InputObject $TargetSceneId -Compress

$expression = @'
(async () => {
  const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value), ch => ch.charCodeAt(0)));
  const bundle = JSON.parse(decode('__BUNDLE64__'));
  const locations = bundle.entities.filter(entity => entity.kind === 'pin');
  const selectedIds = JSON.parse(decode('__PIN64__'));
  const expectedBackup = '__BACKUP64__' ? JSON.parse(decode('__BACKUP64__')) : null;
  const mode = __MODE__, expectedWorld = __WORLD__, targetSceneId = __SCENE__;
  if (!game?.ready || game.world?.id !== expectedWorld || !game.user?.isGM) throw new Error('Foundry não está pronto no mundo GM autorizado.');
  const activePage = new URL(location.href);
  if (activePage.origin !== 'http://localhost:30001' || activePage.pathname !== '/game') throw new Error('A página atual não é o Foundry local /game.');
  const foundryModule = game.modules.get('rpgup-pillars-importer');
  if (!foundryModule?.active || !foundryModule.api) throw new Error('RPG UP Importer não está ativo neste mundo.');
  const glimpse = game.modules.get('glimpse-map-notes');
  const api = glimpse?.active ? glimpse.api : null;
  if (!api?.locations?.plan || !api?.locations?.apply || !api?.locations?.export) throw new Error('API Glimpse plan/apply/export indisponível.');
  const moduleUrl = path => new URL(path, location.origin).href;
  const modelUrl = moduleUrl('/modules/rpgup-pillars-importer/scripts/model.mjs');
  const importerUrl = moduleUrl('/modules/rpgup-pillars-importer/scripts/importer.mjs');
  const source = decode('__ADAPTER64__')
    .replace('from "./model.mjs"', `from "${modelUrl}"`)
    .replace('from "./importer.mjs"', `from "${importerUrl}"`);
  const blobUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
  let adapter;
  try { adapter = await import(blobUrl); }
  finally { URL.revokeObjectURL(blobUrl); }
  const selectedPins = selectedIds.map(id => locations.find(pin => pin.id === id)).filter(Boolean);
  if (selectedPins.length !== selectedIds.length || selectedPins.length !== 3) throw new Error('O piloto deve conter exatamente os três pins revisados de Encampment.');
  const folderName = 'RPG UP — Pillars — Glimpse — Encampment';
  const safeSummary = plan => ({
    worldId: plan.worldId, bundleId: plan.bundleId,
    sceneSettings: (() => { const scene = game.scenes.get(targetSceneId); return scene ? {id: scene.id, name: scene.name, width: scene.width, height: scene.height, padding: scene.padding, tokenVision: scene.tokenVision, fogExploration: scene.fogExploration} : null; })(),
    activePlayerSessions: game.users.filter(user => !user.isGM && user.active).length,
    jobs: plan.jobs.map(job => ({id: job.pin.id, operation: job.operation, sceneId: job.scene.id, journal: plan.rows.find(row => row.id === job.pin.id)?.journal, note: plan.rows.find(row => row.id === job.pin.id)?.note})),
    rows: plan.rows, skipped: plan.skipped, conflicts: plan.conflicts,
    categories: selectedPins.map(pin => ({id: pin.id, category: pin.data.category, spawnState: pin.data.spawnState, x: pin.data.position?.x, y: pin.data.position?.y})),
    imageCount: plan.jobs.reduce((sum, job) => sum + (job.location.images?.length ?? 0), 0),
    soundCount: plan.jobs.filter(job => job.location.sound).length
  });
  const plan = await adapter.planGlimpsePins(bundle, selectedIds, {context: game, glimpseApi: api, assetExists: path => foundry.canvas.srcExists(path)});
  if (plan.jobs.some(job => job.scene.id !== targetSceneId)) throw new Error('A prévia incluiu cena diferente da nova Encampment autorizada.');
  if (plan.jobs.length !== 3 || plan.skipped.length || plan.conflicts.length) return {status: 'blocked', mode, summary: safeSummary(plan)};
  const snapshot = () => {
    const writable = plan.jobs.filter(job => ['create', 'update', 'adopt'].includes(job.operation));
    const scenes = [...new Map(writable.map(job => [job.scene.id, job.scene])).values()];
    const entries = writable.map(job => game.journal.get(job.entryId)).filter(Boolean);
    const pageSnapshots = entries.flatMap(entry => Array.from(entry.pages.contents).filter(page => page.getFlag('rpgup-pillars-importer', 'glimpsePrivatePage')).map(page => page.toObject()));
    const plannedCreates = writable.flatMap(job => [
      ...(job.operation === 'create' ? [{type: 'JournalEntry', locationId: job.location.id}] : []),
      ...(job.operation === 'create' ? [{type: 'Scene.Note', sceneId: job.scene.id, locationId: job.location.id}] : []),
      ...(job.privateText && !job.privatePageExists ? [{type: 'JournalEntryPage', locationId: job.location.id}] : [])
    ]);
    const plannedUpdates = writable.filter(job => job.operation === 'update' || job.operation === 'adopt').map(job => ({locationId: job.location.id, journalId: job.entryId, noteId: job.noteId}));
    return {schemaVersion: '1.0.0', module: 'rpgup-pillars-importer', integration: 'glimpse-map-notes', worldId: plan.worldId, bundleId: plan.bundleId,
      documents: [...scenes.map(scene => ({type: 'Scene', data: scene.toObject()})), ...entries.map(entry => ({type: 'JournalEntry', data: entry.toObject()})), ...pageSnapshots.map(data => ({type: 'JournalEntryPage', data}))], plannedCreates, plannedUpdates};
  };
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  const canonical = value => JSON.stringify(normalize(value));
  if (mode === 'Plan') return {status: 'ok', mode, summary: safeSummary(plan)};
  if (mode === 'Backup') return {status: 'ok', mode, summary: safeSummary(plan), backup: {...snapshot(), createdAt: new Date().toISOString()}};
  if (mode === 'Reimport') {
    const result = await adapter.applyGlimpsePins(plan, {context: game, glimpseApi: api, assetExists: path => foundry.canvas.srcExists(path), backup: async () => { throw new Error('Plano unchanged inesperadamente pediu backup/gravação.'); }});
    return {status: result.failed.length ? 'error' : 'ok', mode, summary: safeSummary(plan), result};
  }
  if (mode !== 'Apply' || !expectedBackup) throw new Error('Apply exige o arquivo de backup prévio.');
  const current = snapshot();
  const currentBackup = {worldId: current.worldId, bundleId: current.bundleId, documents: current.documents, plannedCreates: current.plannedCreates, plannedUpdates: current.plannedUpdates};
  const expectedCore = {worldId: expectedBackup.worldId, bundleId: expectedBackup.bundleId, documents: expectedBackup.documents, plannedCreates: expectedBackup.plannedCreates, plannedUpdates: expectedBackup.plannedUpdates};
  if (canonical(currentBackup) !== canonical(expectedCore)) throw new Error('Estado atual da cena/documentos não confere com o backup prévio; nenhuma alteração foi aplicada.');
  const result = await adapter.applyGlimpsePins(plan, {context: game, glimpseApi: api, assetExists: path => foundry.canvas.srcExists(path), backup: async payload => {
    const incoming = {worldId: payload.worldId, bundleId: payload.bundleId, documents: payload.documents, plannedCreates: payload.plannedCreates, plannedUpdates: payload.plannedUpdates};
    if (canonical(incoming) !== canonical(expectedCore)) throw new Error('Payload de backup mudou antes da escrita.');
    return true;
  }});
  return {status: result.failed.length ? 'error' : 'ok', mode, summary: safeSummary(plan), result};
})()
'@
$expression = $expression.Replace('__BUNDLE64__', $bundle64).Replace('__PIN64__', $pin64).Replace('__BACKUP64__', $backup64).Replace('__MODE__', $modeJson).Replace('__WORLD__', $worldJson).Replace('__SCENE__', $sceneJson).Replace('__ADAPTER64__', $adapter64)

$result = & (Join-Path $PSScriptRoot 'Invoke-FoundryCdp.ps1') -Expression $expression
if ($result.status -ne 'ok') {
    $result | ConvertTo-Json -Depth 30
    exit 1
}

if ($Mode -eq 'Backup') {
    $backupJson = ConvertTo-Json -InputObject $result.value.backup -Depth 100
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($backupFullPath)) | Out-Null
    [System.IO.File]::WriteAllText($backupFullPath, $backupJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    [PSCustomObject]@{status = 'ok'; mode = $Mode; backupPath = $backupFullPath; summary = $result.value.summary} | ConvertTo-Json -Depth 20
}
else {
    $result.value | ConvertTo-Json -Depth 30
}
