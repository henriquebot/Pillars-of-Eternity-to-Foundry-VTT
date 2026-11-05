#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {validateBundle} from "../foundry/scripts/model.mjs";

function fail(message) { throw new Error(message); }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function parseTransform(value) {
  const keys = ["a", "b", "c", "d", "e", "f"];
  if (!value || keys.some(key => !Number.isFinite(value[key]))) fail("Transformação affine2d precisa declarar a, b, c, d, e e f.");
  if (Math.abs(value.a * value.d - value.b * value.c) < 1e-12) fail("Transformação affine2d singular.");
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }

async function main() {
  const [basePath, projectionPath, specPath, outputPath] = process.argv.slice(2);
  if (![basePath, projectionPath, specPath, outputPath].every(Boolean)) {
    fail("Uso: node tools/prepare-glimpse-ir.mjs <bundle-base.json> <projection-objects.json> <spec-reviewed.json> <output.json>");
  }
  const [base, projection, spec, projectionBytes] = await Promise.all([
    readJson(resolve(basePath)), readJson(resolve(projectionPath)), readJson(resolve(specPath)), readFile(resolve(projectionPath))
  ]);
  validateBundle(base);
  if (!spec.approval || spec.approval.status !== "approved-for-notes" || typeof spec.approval.reference !== "string" || !spec.approval.reference.trim()) fail("A spec precisa de aprovação explícita e referência auditável de calibração.");
  if (projection.coordinateFrame !== "unscaled-background-image/top-left") fail("A projeção não usa pixels da imagem original com origem superior esquerda.");
  if (spec.sourceMapId !== projection.map) fail("O ID do mapa da spec não corresponde à projeção.");
  const map = base.entities.find(entity => entity.kind === "map" && entity.id === spec.mapEntityId);
  if (!map) fail("O mapa selecionado não existe no bundle-base.");
  if (spec.target?.width !== map.data.width || spec.target?.height !== map.data.height || spec.target?.image !== map.data.image) fail("A imagem/dimensões alvo não correspondem ao mapa IR.");
  if (!Number.isFinite(spec.target?.padding) || spec.target.padding < 0) fail("Padding alvo inválido.");
  const transform = parseTransform(spec.approval.sourceToCanvas);
  const calibration = {
    status: "approved-for-notes",
    kind: "affine2d",
    sourceFrame: projection.coordinateFrame,
    targetFrame: "Foundry V14 scene canvas pixels, top-left origin",
    transform,
    targetPadding: spec.target.padding,
    targetImage: spec.target.image,
    targetWidth: spec.target.width,
    targetHeight: spec.target.height,
    approvedReference: spec.approval.reference
  };
  map.data.calibration = calibration;
  const sourceObjects = new Map((projection.objects ?? []).map(object => [object.originalId?.pathId, object]));
  const pathIds = new Set();
  const pins = [];
  for (const row of spec.pins ?? []) {
    if (!Number.isSafeInteger(row.pathId) || pathIds.has(row.pathId)) fail(`Path ID inválido/duplicado: ${row.pathId}`);
    pathIds.add(row.pathId);
    const source = sourceObjects.get(row.pathId);
    if (!source || source.name !== row.expectedObjectName || source.originalId?.serializedFile !== "level116") fail(`Objeto Unity não confere com a spec: level116/${row.pathId}.`);
    if (source.activeInHierarchy !== true || source.insideImage !== true || !Number.isFinite(source.positionFoundry?.x) || !Number.isFinite(source.positionFoundry?.y)) fail(`Objeto sem posição projetada ativa dentro da imagem: ${source.name}.`);
    const sourcePosition = {x: source.positionFoundry.x, y: source.positionFoundry.y};
    const position = {
      x: transform.a * sourcePosition.x + transform.c * sourcePosition.y + transform.e,
      y: transform.b * sourcePosition.x + transform.d * sourcePosition.y + transform.f
    };
    if (position.x < 0 || position.y < 0 || position.x > map.data.width || position.y > map.data.height) fail(`Posição transformada fora do mapa: ${source.name}.`);
    const sourceId = `level116/pathId:${row.pathId}`;
    const entity = {
      id: row.id,
      sourceId,
      kind: "pin",
      name: row.name,
      data: {
        ...row.data,
        mapId: map.id,
        category: row.category,
        sourcePosition,
        position,
        positionCalibrated: true,
        coordinateMethod: source.method,
        sourceAnchorConfidence: source.confidence?.objectPivot ?? "unreviewed",
        sourceUnityObject: source.name,
        sourceUnityPathId: row.pathId,
        calibrationReference: spec.approval.reference,
        spawnState: row.spawnState ?? "unknown"
      },
      provenance: {
        source: "Pillars of Eternity 1 local Unity projection",
        sourceId,
        extractedAt: spec.extractedAt,
        sha256: hash(projectionBytes),
        status: "adapted"
      }
    };
    pins.push(entity);
  }
  if (!pins.length) fail("Spec sem pins selecionados.");
  const output = {...base, source: {...base.source, pinProjection: "local/unity-audit/encampment/projection/objects-2d.json", pinCalibrationReference: spec.approval.reference}, entities: [...base.entities, ...pins]};
  validateBundle(output);
  const destination = resolve(outputPath);
  try { await readFile(destination); fail(`A saída já existe; nenhum arquivo foi sobrescrito: ${destination}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`, {flag: "wx"});
  process.stdout.write(`${JSON.stringify({status: "ok", bundleId: output.id, mapCount: base.entities.filter(entity => entity.kind === "map").length, pinCount: pins.length, ids: pins.map(pin => pin.id), calibration: calibration.kind, output: destination})}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
