// Foundry V14 console helper for data-driven Actor imports from an installed Actor compendium.
// Paste this file in F12, then call RPGUPActorImport.run(config).
// The default is dry-run. Persistent creation requires both dryRun:false and allowCreate:true.
// Writes require a temporary scene marker and a backupReference. Existing Actors are never overwritten.
// This helper never deletes documents.
(() => {
  "use strict";

  const FLAG_SCOPE = "rpgup-pillars-importer";

  const stableActor = sourceId => game.actors.contents.filter(actor =>
    actor.getFlag(FLAG_SCOPE, "sourceId") === sourceId
  );

  const stableTokens = (scene, sourceId) => scene.tokens.contents.filter(token =>
    token.getFlag(FLAG_SCOPE, "sourceId") === sourceId
  );

  const validate = config => {
    const errors = [];
    if (!game.user?.isGM) errors.push("A execução exige um usuário GM.");
    if (!config || typeof config !== "object") errors.push("Passe um objeto de configuração.");
    if (!config?.packId) errors.push("packId é obrigatório.");
    if (!config?.entryId) errors.push("entryId é obrigatório.");
    if (!config?.sourceId) errors.push("sourceId estável é obrigatório.");
    if (!config?.name) errors.push("name é obrigatório.");
    if (!config?.portraitPath) errors.push("portraitPath é obrigatório.");
    if (!config?.tokenPath) errors.push("tokenPath é obrigatório.");
    if (!config?.sceneId) errors.push("sceneId é obrigatório.");
    const position = config?.position;
    if (!position || !["x", "y", "width", "height"].every(key => Number.isFinite(position[key]))) {
      errors.push("position precisa conter x, y, width e height numéricos; x/y são o canto superior esquerdo do token.");
    } else if (position.width <= 0 || position.height <= 0) {
      errors.push("A largura e a altura do token precisam ser positivas.");
    }
    for (const field of ["portraitPath", "tokenPath"]) {
      if (typeof config?.[field] === "string" && /^(?:https?:|data:|\/\/)/i.test(config[field])) {
        errors.push(`${field} deve apontar para um asset local do Foundry.`);
      }
      if (typeof config?.[field] === "string" && config[field].split(/[\\/]/).includes("..")) {
        errors.push(`${field} não pode sair da pasta de dados do Foundry.`);
      }
    }
    return errors;
  };

  const createToken = async (scene, actor, config) => {
    const position = config.position;
    const tokenData = {
      name: config.name,
      actorId: actor.id,
      actorLink: true,
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      texture: {
        src: config.tokenPath,
        anchorX: 0.5,
        anchorY: 0.5,
        fit: config.textureFit ?? "contain",
        scaleX: 1,
        scaleY: 1,
        tint: "#ffffff",
        alphaThreshold: 0.75
      },
      flags: {
        [FLAG_SCOPE]: {
          sourceId: config.sourceId,
          testOnly: config.testOnly === true,
          sourceReference: config.sourceReference ?? null,
          positionSource: config.positionSource ?? null
        }
      }
    };
    const created = await scene.createEmbeddedDocuments("Token", [tokenData]);
    return created[0] ?? null;
  };

  const run = async config => {
    const errors = validate(config);
    if (errors.length) return { status: "invalid", errors };

    const pack = game.packs.get(config.packId);
    const scene = game.scenes.get(config.sceneId);
    if (!pack || pack.documentName !== "Actor") errors.push(`Compêndio Actor indisponível: ${config.packId}.`);
    if (!scene) errors.push(`Cena indisponível: ${config.sceneId}.`);
    if (errors.length) return { status: "invalid", errors };

    const base = await pack.getDocument(config.entryId);
    if (!base) return { status: "invalid", errors: [`Entrada indisponível: ${config.entryId}.`] };
    if (base.type !== "npc") return { status: "invalid", errors: [`A entrada-base não é um Actor NPC (type=${base.type}).`] };

    const matches = stableActor(config.sourceId);
    const existingTokens = stableTokens(scene, config.sourceId);
    if (matches.length > 1 || existingTokens.length > 1) {
      return { status: "conflict", actorMatches: matches.length, tokenMatches: existingTokens.length,
        message: "Há mais de um documento com o mesmo sourceId; nenhum foi alterado." };
    }
    if (!matches.length && existingTokens.length) {
      return { status: "conflict", tokenId: existingTokens[0].id,
        message: "Existe token com esse sourceId sem o Actor correspondente; nenhum documento foi alterado." };
    }

    const existingActor = matches[0] ?? null;
    if (!existingActor) {
      const nameCollision = game.actors.contents.find(actor => actor.name === config.name);
      if (nameCollision) return { status: "conflict", actorId: nameCollision.id,
        message: "Já existe Actor com esse nome e outro sourceId; nenhum documento foi alterado." };
    }

    const preview = {
      sourceId: config.sourceId,
      compendium: { packId: pack.collection, entryId: base.id, name: base.name, type: base.type },
      target: { sceneId: scene.id, sceneName: scene.name, name: config.name,
        position: foundry.utils.deepClone(config.position), tokenPath: config.tokenPath,
        portraitPath: config.portraitPath, textureFit: config.textureFit ?? "contain" },
      existing: { actorId: existingActor?.id ?? null, tokenId: existingTokens[0]?.id ?? null }
    };

    const dryRun = config.dryRun !== false;
    if (existingActor && existingTokens.length) return { status: "already-present", preview,
      message: "Actor e token com este sourceId já existem; nenhum dado foi sobrescrito." };

    const writeAuthorized = !dryRun && config.allowCreate === true;
    if (writeAuthorized && !scene.getFlag(FLAG_SCOPE, "actorTestTemporary")?.temporary) {
      return { status: "blocked", preview,
        message: "Escritas só são permitidas em uma cópia de cena marcada como temporária." };
    }
    if (writeAuthorized && !config.backupReference) {
      return { status: "backup-required", preview,
        message: "Informe backupReference de um backup local feito antes da escrita." };
    }

    if (existingActor) {
      if (!writeAuthorized) return { status: "actor-present-token-missing", preview,
        message: "O Actor existe, mas o token não. Para criar somente o token, revise a configuração e use dryRun:false com allowCreate:true." };
      try {
        const token = await createToken(scene, existingActor, config);
        return { status: token ? "token-created" : "partial", preview, actorId: existingActor.id, tokenId: token?.id ?? null };
      } catch (error) {
        return { status: "partial", preview, actorId: existingActor.id, errors: [String(error?.message ?? error)] };
      }
    }

    if (dryRun) return { status: "preview", preview,
      message: "Nenhum documento foi criado. Confira a ficha-base, a arte, a cena e as coordenadas." };
    if (!writeAuthorized) return { status: "confirmation-required", preview,
      message: "Para gravar, defina allowCreate:true junto com dryRun:false." };

    let actor = null;
    try {
      actor = await game.actors.importFromCompendium(pack, config.entryId, { name: config.name });
      if (!actor) return { status: "failed", preview, errors: ["A API de importação não retornou um Actor."] };

      const flags = foundry.utils.deepClone(actor.flags ?? {});
      flags[FLAG_SCOPE] = {
        ...(flags[FLAG_SCOPE] ?? {}),
        sourceId: config.sourceId,
        sourceGame: config.provenance?.sourceGame ?? null,
        sourceMap: config.provenance?.sourceMap ?? null,
        sourceReference: config.sourceReference ?? null,
        testOnly: config.testOnly === true,
        backupReference: config.backupReference,
        mechanicalBase: {
          packId: pack.collection,
          entryId: base.id,
          name: base.name,
          source: config.provenance?.mechanicalSource ?? null,
          rules: config.provenance?.rules ?? null
        },
        provenance: foundry.utils.deepClone(config.provenance ?? {})
      };

      const prototypeToken = actor.prototypeToken.toObject();
      prototypeToken.name = config.name;
      prototypeToken.actorLink = true;
      prototypeToken.width = config.position.width;
      prototypeToken.height = config.position.height;
      prototypeToken.texture = {
        ...prototypeToken.texture,
        src: config.tokenPath,
        anchorX: 0.5,
        anchorY: 0.5,
        fit: config.textureFit ?? "contain",
        scaleX: 1,
        scaleY: 1,
        tint: "#ffffff",
        alphaThreshold: 0.75
      };
      await actor.update({ name: config.name, img: config.portraitPath, flags, prototypeToken });
      const token = await createToken(scene, actor, config);
      return { status: token ? "created" : "partial", preview, actorId: actor.id, tokenId: token?.id ?? null };
    } catch (error) {
      return { status: actor ? "partial" : "failed", preview, actorId: actor?.id ?? null,
        errors: [String(error?.message ?? error)],
        message: "Nenhum rollback destrutivo foi executado; confira os documentos antes de tentar novamente." };
    }
  };

  window.RPGUPActorImport = Object.freeze({ run, validate });
  return { status: "ready", helper: "RPGUPActorImport", mode: "dry-run por padrão" };
})();
