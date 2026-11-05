/**
 * Foundry F12 helper: load a private RPG UP IR string through the importer's
 * normal file input and load action. Pass the JSON text as the first argument.
 * Does not write Foundry documents; it only replaces the importer's in-memory
 * bundle. The importer's preview/apply flow remains responsible for writes.
 *
 * Example in F12:
 * await window.RPGUP_loadIRText(await navigator.clipboard.readText());
 */
window.RPGUP_loadIRText = async function (jsonText, filename = "rpgup-private-ir.json") {
  if (typeof jsonText !== "string" || !jsonText.trim()) throw new Error("JSON em texto é obrigatório.");
  if (jsonText.length > 50 * 1024 * 1024) throw new Error("JSON excede 50 MiB.");
  const root = document.querySelector("#rpgup-pillars-campaign-manager");
  const input = root?.querySelector('input[type="file"]');
  const button = root?.querySelector('button[data-action="load"]');
  if (!input || !button) throw new Error("Gerenciador RPG UP não está aberto.");
  const bundle = JSON.parse(jsonText);
  if (typeof bundle?.id !== "string" || !Array.isArray(bundle.entities)) throw new Error("IR inválido: id/entities ausentes.");
  const transfer = new DataTransfer();
  transfer.items.add(new File([jsonText], filename, {type: "application/json"}));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", {bubbles: true}));
  const original = button.textContent;
  button.click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const text = root.innerText;
    const expected = bundle.id + " — " + bundle.entities.length + " registros";
    if (text.includes(expected)) return {loaded: true, filename, summary: expected};
    if (button.textContent !== original && button.disabled) break;
  }
  return {loaded: root.innerText.includes(bundle.id + " — " + bundle.entities.length + " registros"), filename};
};
