"use strict";
(() => {
  // src/code.ts
  figma.showUI(__html__, { width: 420, height: 720, themeColors: true });
  var busy = false;
  var preferenceWrites = Promise.resolve();
  var cancelled = false;
  var ack;
  function selection() {
    figma.ui.postMessage({ type: "selection", nodes: figma.currentPage.selection.map((n) => ({ id: n.id, name: n.name, width: n.width, height: n.height })) });
  }
  figma.on("selectionchange", selection);
  function watchPage() {
    figma.currentPage.on("nodechange", () => figma.ui.postMessage({ type: "invalidate" }));
  }
  watchPage();
  figma.on("currentpagechange", () => {
    watchPage();
    selection();
  });
  function pdfOrder(nodes, order) {
    const vertical = order === "column";
    const positioned = nodes.map((node, index) => {
      var _a, _b, _c, _d;
      const b = node.absoluteBoundingBox;
      return { node, index, x: (_a = b == null ? void 0 : b.x) != null ? _a : node.x, y: (_b = b == null ? void 0 : b.y) != null ? _b : node.y, width: (_c = b == null ? void 0 : b.width) != null ? _c : node.width, height: (_d = b == null ? void 0 : b.height) != null ? _d : node.height };
    });
    const primary = (n) => vertical ? n.x : n.y;
    const secondary = (n) => vertical ? n.y : n.x;
    positioned.sort((a, b) => primary(a) - primary(b) || secondary(a) - secondary(b) || a.index - b.index);
    const groups = [];
    for (const item of positioned) {
      const last = groups[groups.length - 1];
      const anchor = last == null ? void 0 : last[0];
      const tolerance = anchor ? Math.min(24, (vertical ? Math.min(anchor.width, item.width) : Math.min(anchor.height, item.height)) * 0.25) : 0;
      if (anchor && Math.abs(primary(item) - primary(anchor)) <= tolerance) last.push(item);
      else groups.push([item]);
    }
    return groups.flatMap((group) => group.sort((a, b) => secondary(a) - secondary(b) || a.index - b.index).map((item) => item.node));
  }
  figma.ui.onmessage = async (msg) => {
    var _a, _b, _c;
    if (msg.type === "ready") {
      selection();
      try {
        figma.ui.postMessage({ type: "preferences", value: await ((_a = figma.clientStorage) == null ? void 0 : _a.getAsync("preferences-v1")) });
      } catch (e) {
        figma.ui.postMessage({ type: "preferences" });
      }
      return;
    }
    if (msg.type === "save-preferences") {
      preferenceWrites = preferenceWrites.then(async () => {
        var _a2;
        await ((_a2 = figma.clientStorage) == null ? void 0 : _a2.setAsync("preferences-v1", msg.value));
      }).catch(() => {
      });
      return;
    }
    if (msg.type === "ack") {
      ack == null ? void 0 : ack();
      ack = void 0;
      return;
    }
    if (msg.type === "cancel") {
      cancelled = true;
      ack == null ? void 0 : ack();
      ack = void 0;
      return;
    }
    if (msg.type === "import-images") {
      if (busy) {
        figma.ui.postMessage({ type: "import-result", error: "\u5F53\u524D\u4EFB\u52A1\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u5BFC\u5165\u3002" });
        return;
      }
      busy = true;
      const frames = [];
      const createFrames = msg.createFrames !== false;
      try {
        if (!Array.isArray(msg.files) || !msg.files.length) throw new Error("\u8BF7\u9009\u62E9\u56FE\u7247\u3002");
        const page = figma.currentPage;
        const center = figma.viewport.center;
        const originX = Math.round(center.x), originY = Math.round(center.y);
        let x = originX, y = originY, rowHeight = 0;
        const rowWidth = Math.max(1200, figma.viewport.bounds.width);
        for (const file of msg.files) {
          if (figma.currentPage !== page) throw new Error("\u5BFC\u5165\u671F\u95F4\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u76EE\u6807\u9875\u9762\u91CD\u65B0\u5BFC\u5165\u3002");
          if (typeof file.name !== "string" || !file.name || !(file.bytes instanceof Uint8Array) || !file.bytes.length) throw new Error("\u56FE\u7247\u6570\u636E\u65E0\u6548\u3002");
          figma.ui.postMessage({ type: "import-progress", message: `\u6B63\u5728\u5BFC\u5165 ${frames.length + 1} / ${msg.files.length}\uFF1A${file.name}` });
          const image = figma.createImage(file.bytes);
          const { width, height } = await image.getSizeAsync();
          if (figma.currentPage !== page) throw new Error("\u5BFC\u5165\u671F\u95F4\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u5BFC\u5165\u3002");
          if (x > originX && x + width > originX + rowWidth) {
            x = originX;
            y += rowHeight + 40;
            rowHeight = 0;
          }
          const name = file.name.replace(/\.(png|jpe?g|webp)$/i, "");
          let frame;
          if (createFrames) {
            frame = figma.createFrame();
            frames.push(frame);
            frame.name = name;
            frame.resize(width, height);
            frame.fills = [];
            frame.x = x;
            frame.y = y;
          }
          const rectangle = figma.createRectangle();
          if (frame) frame.appendChild(rectangle);
          else {
            frames.push(rectangle);
            page.appendChild(rectangle);
          }
          rectangle.name = name;
          rectangle.resize(width, height);
          rectangle.x = frame ? 0 : x;
          rectangle.y = frame ? 0 : y;
          rectangle.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
          x += width + 40;
          rowHeight = Math.max(rowHeight, height);
        }
        page.selection = frames;
        figma.viewport.scrollAndZoomIntoView(frames);
        figma.commitUndo();
        figma.ui.postMessage({ type: "import-result", count: frames.length, createFrames });
      } catch (error) {
        for (const frame of frames) if (!frame.removed) frame.remove();
        figma.ui.postMessage({ type: "import-result", error: error instanceof Error ? error.message : String(error) });
      } finally {
        busy = false;
      }
      return;
    }
    if (msg.type !== "prepare") return;
    if (busy) {
      figma.ui.postMessage({ type: "error", message: "\u4E0A\u4E00\u6B21\u5BFC\u51FA\u4ECD\u5728\u6536\u5C3E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u9884\u89C8\u3002" });
      return;
    }
    busy = true;
    cancelled = false;
    try {
      const nodes = [...figma.currentPage.selection];
      const scales = msg.scales;
      const formats = msg.formats;
      if (!nodes.length || !scales.length || !formats.length || scales.some((s) => !Number.isFinite(s) || s <= 0 || s > 16) || formats.some((f) => !["png", "jpeg", "webp", "svg", "pdf", "mp4", "gif"].includes(f))) throw new Error("\u8BF7\u9009\u62E9\u5BF9\u8C61\u3001\u683C\u5F0F\u53CA\u6709\u6548\u500D\u7387\uFF080\u201316x\uFF09\u3002");
      const mergePDF = formats.includes("pdf") && msg.mergePDF === true;
      const imageFormats = formats.filter((f) => f !== "mp4" && f !== "gif" && !(mergePDF && f === "pdf"));
      const videoFrames = [];
      if (formats.includes("mp4")) {
        for (const node of nodes) {
          const frame = node.type === "FRAME" && ((_b = node.parent) == null ? void 0 : _b.type) === "PAGE" ? node : node.getTopLevelFrame();
          if (!frame) throw new Error(`${node.name} \u6CA1\u6709\u6240\u5C5E\u9876\u5C42 Frame\u3002\u8BF7\u5C06\u89C6\u9891\u653E\u5165\u9875\u9762\u9876\u5C42 Frame \u540E\u518D\u5BFC\u51FA MP4\u3002`);
          if (!videoFrames.some((f) => f.id === frame.id)) videoFrames.push(frame);
        }
      }
      const total = (nodes.length * imageFormats.length + videoFrames.length + (formats.includes("gif") ? 1 : 0) + (mergePDF ? 1 : 0)) * scales.length;
      if (mergePDF) for (const scale of scales) {
        const ordered = pdfOrder(nodes, msg.pdfOrder);
        const sources = [];
        let bytes = 0;
        for (const node of ordered) {
          if (cancelled) break;
          figma.ui.postMessage({ type: "progress", message: `\u6B63\u5728\u51C6\u5907 PDF \u9875\u9762 ${sources.length + 1} / ${ordered.length}\uFF1A${node.name}` });
          const source = await node.exportAsync({ format: "PDF", colorProfile: "SRGB" });
          bytes += source.length;
          if (bytes > 128 * 1024 * 1024) throw Error("\u5F85\u5408\u5E76 PDF \u8D85\u8FC7 128 MB\uFF0C\u8BF7\u5206\u6279\u5BFC\u51FA\u3002");
          sources.push(source);
        }
        if (cancelled) break;
        const receipt = new Promise((resolve) => {
          ack = resolve;
        });
        figma.ui.postMessage({ type: "asset", format: "pdf", pdfSources: sources, scale, index: 0, name: "\u5408\u5E76\u6587\u6863", total });
        await receipt;
      }
      if (formats.includes("gif")) for (const scale of scales) {
        const frames = [];
        let pixels = 0;
        for (const node of nodes) {
          if (cancelled) break;
          const width = Math.ceil(node.width * scale), height = Math.ceil(node.height * scale);
          pixels += width * height;
          if (Math.max(width, height) > 4096 || pixels > 32e6 || nodes.length > 200) throw new Error("GIF \u6700\u591A 200 \u5E27\u3001\u7D2F\u8BA1 3200 \u4E07\u50CF\u7D20\u3001\u6700\u957F\u8FB9 4096\uFF1B\u8BF7\u51CF\u5C11\u5BF9\u8C61\u6216\u500D\u7387\u3002");
          frames.push(await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale }, colorProfile: "SRGB" }));
        }
        if (cancelled) break;
        const receipt = new Promise((resolve) => {
          ack = resolve;
        });
        figma.ui.postMessage({ type: "asset", format: "gif", frames, scale, index: 0, name: nodes[0].name + "_\u52A8\u753B", total, delay: msg.gifDelay, loops: (_c = msg.gifLoops) != null ? _c : 0 });
        await receipt;
      }
      for (let index = 0; index < videoFrames.length; index++) {
        const frame = videoFrames[index];
        for (const scale of scales) {
          if (cancelled) break;
          const quality = msg.mode === "size" ? "LOW" : msg.mode === "balanced" ? "MEDIUM" : "HIGH";
          const fps = [12, 24, 30, 60].includes(msg.fps) ? msg.fps : 30;
          figma.ui.postMessage({ type: "progress", message: `\u6B63\u5728\u7531 Figma \u7F16\u7801 ${frame.name} \xB7 ${scale}x MP4\u2026` });
          let bytes;
          try {
            bytes = await frame.exportAsync({ format: "MP4", fps, quality, constraint: { type: "WIDTH", value: Math.max(1, Math.round(frame.width * scale)) } });
          } catch (error) {
            throw new Error(`${frame.name} \u65E0\u6CD5\u5BFC\u51FA MP4\uFF1A\u9700\u8981 Figma \u652F\u6301\u7684\u52A8\u6001\u9876\u5C42 Frame\u3002\u89C6\u9891\u586B\u5145\u4E0D\u4E00\u5B9A\u6784\u6210\u53EF\u5BFC\u51FA\u7684\u52A8\u753B\uFF0C\u65E0\u6CD5\u76F4\u63A5\u63D0\u53D6\u539F\u59CB\u89C6\u9891\u3002\u8BE6\u60C5\uFF1A${String(error)}`);
          }
          if (cancelled) break;
          const receipt = new Promise((resolve) => {
            ack = resolve;
          });
          figma.ui.postMessage({ type: "asset", bytes, format: "mp4", scale, index, name: frame.name, total, note: `Figma MP4 \xB7 ${fps} fps \xB7 ${quality} \xB7 \u65E0\u4E8C\u6B21\u538B\u7F29` });
          await receipt;
        }
        if (cancelled) break;
      }
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        for (const scale of scales) {
          if (cancelled) break;
          if (formats.some((f) => ["png", "jpeg", "webp"].includes(f)) && (node.width * scale * node.height * scale > 32e6 || Math.max(node.width, node.height) * scale > 16384)) throw new Error(`${node.name} \u7684\u8F93\u51FA\u5C3A\u5BF8\u8FC7\u5927\uFF0C\u8BF7\u964D\u4F4E\u500D\u7387\u6216\u5206\u6279\u5BFC\u51FA\u3002`);
          let png;
          for (const format of imageFormats) {
            if (cancelled) break;
            let bytes;
            if (msg.mode === "none" && format === "jpeg") {
              bytes = await node.exportAsync({ format: "JPG", constraint: { type: "SCALE", value: scale }, colorProfile: "SRGB" });
            } else if (["png", "jpeg", "webp"].includes(format)) {
              png != null ? png : png = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale }, colorProfile: "SRGB" });
              bytes = png;
            } else {
              bytes = await node.exportAsync({ format: format === "svg" ? "SVG" : "PDF", colorProfile: "SRGB" });
            }
            if (cancelled) break;
            const receipt = new Promise((resolve) => {
              ack = resolve;
            });
            figma.ui.postMessage({ type: "asset", bytes, format, scale, index, name: node.name, total, native: msg.mode === "none" && (["png", "jpeg"].includes(format) || scale === 1 && ["svg", "pdf"].includes(format)) });
            await receipt;
          }
        }
        if (cancelled) break;
      }
      figma.ui.postMessage({ type: "done", cancelled });
    } catch (error) {
      figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = false;
      ack = void 0;
    }
  };
})();
