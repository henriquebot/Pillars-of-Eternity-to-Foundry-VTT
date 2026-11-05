/**
 * Foundry Console / F12 script for uploading the two repaired map images.
 * Start serve-two-map-assets.py first. This uses only the public V14
 * FilePicker.upload API and verifies file names, sizes, and SHA-256 before
 * writing unique paths in the local test world's existing map-assets folder.
 */
(async () => {
  "use strict";
  const worldId = "rpgup-pillars-tests";
  const directory = "worlds/rpgup-pillars-tests/poe-maps";
  const assets = [
    {
      name: "valewood-base-6x6-2026-11-04.webp",
      bytes: 43476712,
      sha256: "1d9fdfb138e2307e66eb49d4d292060db8abc71d3f1f6ee4f75a5ebdcadc75d5"
    },
    {
      name: "gilded-vale-base-6x10-2026-11-04.webp",
      bytes: 73578114,
      sha256: "1acc52f410d853b86a234ad438d3f8c8f644a3da6354022ba284d8157312ba35"
    }
  ];
  if (!game?.ready || !game.user?.isGM || game.world?.id !== worldId) {
    throw new Error("Execute como GM somente no Foundry Desktop local, mundo rpgup-pillars-tests.");
  }
  if (typeof FilePicker?.upload !== "function" || typeof FilePicker?.browse !== "function") {
    throw new Error("A API pública FilePicker do Foundry V14 não está disponível.");
  }
  const before = await FilePicker.browse("data", directory);
  const conflicts = (before.files ?? []).filter(path => assets.some(asset => path.endsWith(`/${asset.name}`)));
  if (conflicts.length) throw new Error(`Os caminhos novos já existem; nenhum arquivo foi enviado: ${conflicts.join(", ")}`);

  const ready = [];
  for (const asset of assets) {
    const response = await fetch(`http://127.0.0.1:8766/${asset.name}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`Servidor local não entregou ${asset.name}: HTTP ${response.status}.`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== asset.bytes) throw new Error(`Tamanho inesperado em ${asset.name}: ${buffer.byteLength}.`);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
      .map(value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== asset.sha256) throw new Error(`SHA-256 inesperado em ${asset.name}; upload cancelado.`);
    ready.push({asset, buffer, digest});
  }

  const uploaded = [];
  for (const {asset, buffer, digest} of ready) {
    const file = new File([buffer], asset.name, {type: "image/webp", lastModified: Date.now()});
    const result = await FilePicker.upload("data", directory, file, {}, {notify: false});
    uploaded.push({name: asset.name, bytes: file.size, sha256: digest, result});
  }
  const after = await FilePicker.browse("data", directory);
  const verified = assets.every(asset => (after.files ?? []).some(path => path.endsWith(`/${asset.name}`)));
  const result = {ok: verified, worldId, directory, uploaded, verifiedNames: assets.map(asset => asset.name)};
  console.info("[RPG UP] repaired map assets", result);
  return result;
})();
