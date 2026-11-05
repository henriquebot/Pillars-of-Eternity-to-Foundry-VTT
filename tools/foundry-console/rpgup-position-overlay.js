/*
 * Generic temporary overlay for Foundry VTT v14.
 * F12: paste/evaluate this file to define RPGUPPositionOverlay, then pass a
 * private array of {id, name, x, y, category, status, shape} image-pixel points
 * to RPGUPPositionOverlay.show(points, {worldId, sceneId, sceneName}).
 * This only adds an in-memory PIXI overlay and a temporary DOM legend. It does
 * not create or update Foundry documents. Call RPGUPPositionOverlay.clear().
 */
(() => {
  const STATE = "__rpgupPositionOverlayState";
  const PALETTE = {
    initial: 0x219e82,
    event: 0xe76f51,
    alternative: 0xc44b50,
    marker: 0x3c9bb4,
    conditional: 0xd9a441,
    ambient: 0x4386b5,
    uncertain: 0xa66bc2
  };

  function clear() {
    const old = window[STATE];
    if (!old) return {status: "already-clear"};
    try {
      if (old.container?.parent) old.container.parent.removeChild(old.container);
      old.container?.destroy({children: true});
    } catch (error) {
      console.warn("RPG UP overlay graphics cleanup:", error);
    }
    old.panel?.remove();
    delete window[STATE];
    return {status: "cleared"};
  }

  function deriveCanvasTransform() {
    const scene = game?.scenes?.active;
    const level = canvas?.level;
    const image = canvas?.primary?.children?.find(child => child.name === `Level.${level?.sort ?? 0}.background`);
    if (!scene || !level || !image?.texture) throw new Error("Scene, active Level, or rendered background image is unavailable.");

    const sourceWidth = image.texture.orig?.width ?? image.texture.width;
    const sourceHeight = image.texture.orig?.height ?? image.texture.height;
    const background = scene.background ?? {};
    const anchorX = background.anchorX ?? level.toObject?.().textures?.anchorX ?? 0;
    const anchorY = background.anchorY ?? level.toObject?.().textures?.anchorY ?? 0;
    const rotation = image.rotation ?? 0;
    const shiftX = scene.shiftX ?? 0;
    const shiftY = scene.shiftY ?? 0;
    const scaleX = image.scale?.x ?? 1;
    const scaleY = image.scale?.y ?? 1;

    if (Math.abs(rotation) > 1e-8) throw new Error("Rotated backgrounds are not supported by this helper.");
    if (scene.width !== sourceWidth || scene.height !== sourceHeight) throw new Error("Scene and background texture dimensions differ.");
    if (Math.abs(shiftX) > 1e-8 || Math.abs(shiftY) > 1e-8) throw new Error("Scene shift is non-zero; review the coordinate transform first.");

    const originX = image.position.x - anchorX * sourceWidth * scaleX;
    const originY = image.position.y - anchorY * sourceHeight * scaleY;
    const rect = canvas.dimensions.sceneRect;
    if (Math.abs(originX - rect.x) > 0.01 || Math.abs(originY - rect.y) > 0.01) {
      throw new Error(`Rendered image origin (${originX}, ${originY}) does not match Foundry sceneRect (${rect.x}, ${rect.y}).`);
    }
    if (Math.abs(originX + sourceWidth * scaleX - rect.x - rect.width) > 0.01 ||
        Math.abs(originY + sourceHeight * scaleY - rect.y - rect.height) > 0.01) {
      throw new Error("Rendered image bounds do not match the Foundry scene rectangle.");
    }

    return {
      worldId: game.world.id,
      sceneId: scene.id,
      sceneName: scene.name,
      levelId: level.id,
      levelName: level.name,
      sceneWidth: scene.width,
      sceneHeight: scene.height,
      canvasWidth: canvas.dimensions.width,
      canvasHeight: canvas.dimensions.height,
      padding: scene.padding,
      sceneRect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      image: {
        src: background.src,
        sourceWidth,
        sourceHeight,
        originX,
        originY,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        rotation,
        fit: background.fit ?? level.toObject?.().textures?.fit ?? null,
        offsetX: background.offsetX ?? 0,
        offsetY: background.offsetY ?? 0
      }
    };
  }

  function chooseLabelPositions(points, transform) {
    const radius = 19;
    const minimumGap = 46;
    const placed = [];
    const directions = [];
    for (let distance = 32; distance <= 480; distance += 20) {
      for (let i = 0; i < 24; i++) {
        const angle = (Math.PI * 2 * i) / 24;
        directions.push({dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance});
      }
    }
    return points.map(point => {
      const x = transform.image.originX + point.x * transform.image.scaleX;
      const y = transform.image.originY + point.y * transform.image.scaleY;
      const options = [{dx: 0, dy: 0}, ...directions];
      let label = {x, y};
      for (const offset of options) {
        const cx = x + offset.dx;
        const cy = y + offset.dy;
        if (cx < transform.sceneRect.x + radius || cx > transform.sceneRect.x + transform.sceneRect.width - radius ||
            cy < transform.sceneRect.y + radius || cy > transform.sceneRect.y + transform.sceneRect.height - radius) continue;
        if (placed.every(other => Math.hypot(cx - other.x, cy - other.y) >= minimumGap)) {
          label = {x: cx, y: cy};
          break;
        }
      }
      placed.push(label);
      return {...point, canvasX: x, canvasY: y, labelX: label.x, labelY: label.y};
    });
  }

  function makePanel(points, transform) {
    const panel = document.createElement("section");
    panel.setAttribute("aria-label", "Prévia temporária de posições RPG UP");
    Object.assign(panel.style, {
      position: "fixed", top: "70px", right: "62px", zIndex: "1000000000",
      width: "350px", maxHeight: "calc(100vh - 100px)", overflow: "hidden",
      display: "flex", flexDirection: "column", color: "#f3f6fa",
      background: "rgba(15, 23, 32, 0.94)", border: "1px solid #718096",
      borderRadius: "7px", boxShadow: "0 4px 18px rgba(0,0,0,.55)",
      font: "12px/1.35 Arial, sans-serif", pointerEvents: "auto"
    });
    const header = document.createElement("div");
    Object.assign(header.style, {padding: "10px 12px", borderBottom: "1px solid #405164"});
    const title = document.createElement("strong");
    title.textContent = `${transform.sceneName}: ${points.length} posições`;
    title.style.fontSize = "14px";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Limpar prévia";
    Object.assign(close.style, {float: "right", color: "white", background: "#713f45", border: "0", borderRadius: "4px", padding: "4px 7px", cursor: "pointer"});
    close.addEventListener("click", () => window.RPGUPPositionOverlay.clear(), {once: true});
    const formula = document.createElement("div");
    formula.textContent = `Imagem ${transform.image.sourceWidth}×${transform.image.sourceHeight}; canvas (${transform.image.originX}, ${transform.image.originY}) + pixel × escala (${transform.image.scaleX}, ${transform.image.scaleY})`;
    Object.assign(formula.style, {color: "#c6d1dc", marginTop: "6px", fontSize: "10px"});
    const warning = document.createElement("div");
    warning.textContent = "Prévia em memória. Ponto = coordenada transformada; bolha numerada pode estar deslocada para leitura. Pivôs e spawn não validados.";
    Object.assign(warning.style, {color: "#f0d796", marginTop: "5px", fontSize: "10px"});
    header.append(title, close, formula, warning);
    const list = document.createElement("div");
    Object.assign(list.style, {padding: "6px 10px 10px", overflow: "auto"});
    const categories = [
      ["initial", "Inicial candidata"], ["event", "Evento"], ["alternative", "Alternativa/corpo"],
      ["marker", "Marcador/waypoint"], ["conditional", "Condicional"], ["ambient", "Ambiente"], ["uncertain", "Incerto"]
    ];
    for (const [key, label] of categories) {
      const group = points.filter(point => point.category === key);
      if (!group.length) continue;
      const section = document.createElement("div");
      const heading = document.createElement("div");
      heading.textContent = `${label} (${group.length})`;
      Object.assign(heading.style, {color: `#${PALETTE[key].toString(16).padStart(6, "0")}`, fontWeight: "bold", padding: "5px 0 2px"});
      section.appendChild(heading);
      for (const point of group) {
        const row = document.createElement("div");
        row.textContent = `${String(point.number).padStart(2, "0")}  ${point.name} [${point.id}] — ${point.status}`;
        Object.assign(row.style, {padding: "2px 0", color: "#e1e8ef", borderBottom: "1px solid rgba(120,140,160,.16)"});
        section.appendChild(row);
      }
      list.appendChild(section);
    }
    panel.append(header, list);
    document.body.appendChild(panel);
    return panel;
  }

  function show(points, expected = {}) {
    if (!Array.isArray(points) || !points.length) throw new Error("Pass a non-empty point array.");
    clear();
    if (!canvas?.ready) throw new Error("Foundry canvas is not ready.");
    const transform = deriveCanvasTransform();
    if (expected.worldId && expected.worldId !== transform.worldId) throw new Error("Unexpected Foundry world ID.");
    if (expected.sceneId && expected.sceneId !== transform.sceneId) throw new Error("Unexpected Foundry scene ID.");
    if (expected.sceneName && expected.sceneName !== transform.sceneName) throw new Error("Unexpected Foundry scene name.");
    if (expected.levelId && expected.levelId !== transform.levelId) throw new Error("Unexpected Foundry Level ID.");
    if (expected.backgroundSrc && expected.backgroundSrc !== transform.image.src) throw new Error("Unexpected Foundry background source.");

    const mapped = chooseLabelPositions(points, transform);
    const container = new PIXI.Container();
    container.name = "RPGUP_TEMP_POSITION_OVERLAY";
    container.zIndex = 950;
    container.interactive = false;
    container.eventMode = "none";
    const links = new PIXI.Graphics();
    const marks = new PIXI.Graphics();
    container.addChild(links, marks);
    const textObjects = [];
    for (const point of mapped) {
      const color = PALETTE[point.category] ?? 0xffffff;
      if (Math.hypot(point.labelX - point.canvasX, point.labelY - point.canvasY) > 1) {
        links.lineStyle(1.5, color, 0.75).moveTo(point.canvasX, point.canvasY).lineTo(point.labelX, point.labelY);
      }
      marks.beginFill(color, 0.95).lineStyle(2, 0xffffff, 0.95);
      if (point.shape === "square") marks.drawRoundedRect(point.labelX - 18, point.labelY - 18, 36, 36, 4);
      else marks.drawCircle(point.labelX, point.labelY, 18);
      marks.endFill();
      marks.beginFill(color, 1).lineStyle(1, 0xffffff, 0.95).drawCircle(point.canvasX, point.canvasY, 4).endFill();
      const label = new PIXI.Text(String(point.number).padStart(2, "0"), {
        fontFamily: "Arial", fontSize: 17, fontWeight: "bold", fill: 0xffffff,
        stroke: 0x101820, strokeThickness: 3, align: "center"
      });
      label.anchor.set(0.5);
      label.position.set(point.labelX, point.labelY);
      label.eventMode = "none";
      textObjects.push(label);
      container.addChild(label);
    }
    canvas.interface.addChild(container);
    const panel = makePanel(mapped, transform);
    window[STATE] = {container, panel, transform, points: mapped};
    return {
      status: "shown",
      count: mapped.length,
      worldId: transform.worldId,
      sceneId: transform.sceneId,
      sceneName: transform.sceneName,
      levelId: transform.levelId,
      transform: {
        imageOrigin: {x: transform.image.originX, y: transform.image.originY},
        imageScale: {x: transform.image.scaleX, y: transform.image.scaleY},
        sceneRect: transform.sceneRect,
        canvasSize: {width: transform.canvasWidth, height: transform.canvasHeight}
      },
      anchors: mapped.map(point => ({number: point.number, id: point.id, canvasX: point.canvasX, canvasY: point.canvasY, category: point.category}))
    };
  }

  window.RPGUPPositionOverlay = {show, clear};
  return {status: "helper-ready", methods: ["show", "clear"]};
})();
