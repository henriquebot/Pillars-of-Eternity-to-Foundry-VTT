/** Pure text rendering for the GM inspector. Handlebars escapes this output. */
export function localizedText(value, requestedLanguage = "pt-BR", translate) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (!Object.hasOwn(value, "defaultText") && Object.hasOwn(value, "text")) return localizedText(value.text, requestedLanguage, translate);
  const text = typeof value.defaultText === "string" ? value.defaultText : "";
  if (!text) return "";
  const mismatched = typeof value.language === "string" && value.language.toLowerCase() !== requestedLanguage.toLowerCase();
  if (!value.translationMissing && !mismatched) return text;
  const language = typeof value.language === "string" ? value.language.toUpperCase() : "ORIGINAL";
  const pending = translate ? translate("TranslationPending") : requestedLanguage === "pt-BR" ? "tradução pendente" : "translation pending";
  return `[${language} — ${pending}]\n${text}`;
}

export function renderNarrative(entity, language = "pt-BR", translate = key => key) {
  const data = entity.data, localized = data.texts?.[language] ?? data.texts?.en;
  const lines = [];
  const text = value => localizedText(value, language, translate);
  const outerFallback = values => {
    if (!values?.[language] && values?.en && language !== "en") lines.push(`[EN — ${translate("TranslationPending")}]`);
  };
  outerFallback(data.texts);
  if (data.publicText) lines.push(`${translate("PublicText")}\n${data.publicText}`);
  if (data.gmText || data.description) lines.push(`${translate("PrivateText")}\n${data.gmText ?? data.description}`);
  if (localized) {
    lines.push(text(localized.title), text(localized.description));
    for (const node of localized.nodes ?? []) lines.push(`${node.id}: ${text(node.title)}\n${text(node.description)}`);
    for (const addendum of localized.addenda ?? []) lines.push(`${translate("Addendum")} #${addendum.id ?? "?"}: ${text(addendum.text ?? addendum)}`);
    for (const ending of localized.endStates ?? []) lines.push(`${translate("Ending")} #${ending.id ?? "?"}: ${text(ending.text ?? ending)}`);
  }
  for (const node of data.nodes ?? []) {
    const line = node.texts?.[language] ?? node.texts?.en;
    lines.push(`\n#${node.id} ${node.isPlayerChoice ? translate("PlayerChoice") : translate("NPCLine")}${node.speaker ? ` (${node.speaker})` : ""}`);
    outerFallback(node.texts);
    lines.push(text(line));
    if (node.links?.length) lines.push(`${translate("Links")}: ${node.links.map(link => link.to).join(", ")}`);
    if (node.conditions) lines.push(`${translate("ManualConditions")}: ${JSON.stringify(node.conditions)}`);
    if (node.scripts?.length) lines.push(`${translate("ManualConsequences")}: ${JSON.stringify(node.scripts)}`);
  }
  if (data.automation) lines.push(`${translate("Automation")}: ${data.automation}`);
  if (data.semantics) lines.push(`${translate("Semantics")}: ${data.semantics}`);
  if (!lines.some(Boolean)) lines.push(JSON.stringify(data, null, 2));
  return lines.filter(Boolean).join("\n").slice(0, 200000);
}
