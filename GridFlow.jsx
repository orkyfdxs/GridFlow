/*
    GridFlow v2.0 — animated mosaic/layout grid rig for After Effects
    ------------------------------------------------------------------
    Rigs rectangle shape-layer panels to "grid line" sliders on a
    controller null. Animate a handful of sliders and the whole layout
    reflows edge-to-edge (MUJI-ad style).

    v2.0 — nested splits:
      - "Split Vertical" / "Split Horizontal" cut any selected panel in
        two. Each split gets its OWN divider slider, so moving it only
        affects the two sides of that split — independent of the rest
        of the layout.
      - "Bind Selected to Panel": select content layer(s) plus ONE
        GF panel, click, and the content rides that panel.
      - Panels remember their edges in the layer comment (GFP|L|R|T|B
        tokens naming sliders on the controller). Don't edit those.

    Workflow:
      1. Create Grid (use 1x1 for a blank canvas to carve up).
      2. Select a panel, Split Vertical / Split Horizontal, repeat.
      3. "Keyframe Layout" snapshots all sliders at the playhead
         (staggered, eased). Move ahead, drag sliders or "Shuffle",
         keys are added automatically.
      4. Select content + its panel, "Bind Selected to Panel".
      5. Panel colors: each panel's "Palette" slider (1-5) picks from
         the Palette color controls on the controller null.

    Note: panels are created at the BOTTOM of the layer stack (they
    are a background). Layers above them will cover them.
*/

(function gridFlow(thisObj) {

    var SCRIPT_NAME = "GridFlow";
    var CTRL_TAG = "GridFlowCtrl";
    var PANEL_PREFIX = "GFP|";
    var LEGACY_PANEL_TAG = "GridFlowPanel";
    var CTRL_FX = "GF Ctrl";

    var PALETTE = [
        [0.855, 0.843, 0.831],
        [0.780, 0.769, 0.761],
        [0.561, 0.549, 0.541],
        [0.420, 0.408, 0.400],
        [0.490, 0.004, 0.071]
    ];

    // ---------------------------------------------------------------- utils

    function getComp() {
        var c = app.project ? app.project.activeItem : null;
        if (!(c && c instanceof CompItem)) {
            alert(SCRIPT_NAME + ": open/select a composition first.");
            return null;
        }
        return c;
    }

    function findCtrl(comp) {
        var i, ly;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).comment === CTRL_TAG) return comp.layer(i);
        }
        for (i = 1; i <= comp.numLayers; i++) {
            ly = comp.layer(i);
            if (ly.nullLayer && ly.name.indexOf("GridFlow") === 0) return ly;
        }
        return null;
    }

    function addSlider(layer, name, value) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(value);
        return fx;
    }

    function addColor(layer, name, rgb) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
        fx.name = name;
        fx.property(1).setValue(rgb);
        return fx;
    }

    function addCtrlRef(layer, ctrl) {
        var parade = layer.property("ADBE Effect Parade");
        var fx = parade.property(CTRL_FX);
        if (fx === null) {
            fx = parade.addProperty("ADBE Layer Control");
            fx.name = CTRL_FX;
        }
        fx.property(1).setValue(ctrl.index);
        return fx;
    }

    function ensureSlider(layer, name, value) {
        var parade = layer.property("ADBE Effect Parade");
        var fx = parade.property(name);
        if (fx === null) {
            fx = parade.addProperty("ADBE Slider Control");
            fx.name = name;
            fx.property(1).setValue(value);
        }
        return fx;
    }

    function ensurePoint(layer, name, value) {
        var parade = layer.property("ADBE Effect Parade");
        var fx = parade.property(name);
        if (fx === null) {
            fx = parade.addProperty("ADBE Point Control");
            fx.name = name;
            fx.property(1).setValue(value);
        }
        return fx;
    }

    function sliderVal(ctrl, name) {
        return ctrl.property("ADBE Effect Parade").property(name).property(1).value;
    }

    function isPanel(ly) {
        return ly.comment.indexOf(PANEL_PREFIX) === 0;
    }

    function parseToks(ly) {
        if (!isPanel(ly)) return null;
        var parts = ly.comment.split("|");
        if (parts.length < 5) return null;
        return [parts[1], parts[2], parts[3], parts[4]]; // L R T B slider names
    }

    function panelComment(toks) {
        return PANEL_PREFIX + toks.join("|");
    }

    function edgeExpr(toks) {
        return 'var c = effect("' + CTRL_FX + '")("Layer");\n' +
               'var L = c.effect("' + toks[0] + '")("Slider")/100;\n' +
               'var R = c.effect("' + toks[1] + '")("Slider")/100;\n' +
               'var T = c.effect("' + toks[2] + '")("Slider")/100;\n' +
               'var B = c.effect("' + toks[3] + '")("Slider")/100;\n' +
               'R = Math.max(R, L);\n' +
               'B = Math.max(B, T);\n';
    }

    function panelContents(sl) {
        return sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    }

    function applyPanelGeometry(sl, toks) {
        var edges = edgeExpr(toks);
        var contents = panelContents(sl);
        contents.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").expression =
            edges + '[(R-L)*thisComp.width, (B-T)*thisComp.height]';
        sl.property("ADBE Transform Group").property("ADBE Position").expression =
            edges + '[(L+R)/2*thisComp.width, (T+B)/2*thisComp.height]';
    }

    function lineProps(ctrl) {
        var fx = ctrl.property("ADBE Effect Parade");
        var cols = [], rows = [], splits = [];
        for (var i = 1; i <= fx.numProperties; i++) {
            var p = fx.property(i);
            if (p.name.indexOf("Col ") === 0) cols.push(p.property(1));
            else if (p.name.indexOf("Row ") === 0) rows.push(p.property(1));
            else if (p.name.indexOf("Split ") === 0) splits.push(p.property(1));
        }
        return { cols: cols, rows: rows, splits: splits, all: cols.concat(rows).concat(splits) };
    }

    function easeKey(prop, keyIndex) {
        var e = new KeyframeEase(0, 75);
        prop.setTemporalEaseAtKey(keyIndex, [e], [e]);
    }

    // ---------------------------------------------------------------- create grid

    function createGrid(rows, cols) {
        var comp = getComp();
        if (!comp) return;
        if (rows < 1 || cols < 1 || rows > 8 || cols > 8) {
            alert(SCRIPT_NAME + ": rows/cols must be 1-8.");
            return;
        }
        if (findCtrl(comp)) {
            alert(SCRIPT_NAME + ": this comp already has a GridFlow rig.\nUse 'Remove Rig' first to rebuild.");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + ": Create Grid");
        try {
            var ctrl = comp.layers.addNull(comp.duration);
            ctrl.name = "GridFlow Ctrl";
            ctrl.comment = CTRL_TAG;
            ctrl.label = 10;

            var i;
            for (i = 0; i < PALETTE.length; i++) {
                addColor(ctrl, "Palette " + (i + 1), PALETTE[i]);
            }
            for (i = 0; i <= cols; i++) addSlider(ctrl, "Col " + i, (i / cols) * 100);
            for (i = 0; i <= rows; i++) addSlider(ctrl, "Row " + i, (i / rows) * 100);

            var n = 0;
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    var toks = ["Col " + c, "Col " + (c + 1), "Row " + r, "Row " + (r + 1)];
                    makePanel(comp, ctrl, "GF Panel r" + (r + 1) + "c" + (c + 1), toks, (n % PALETTE.length) + 1);
                    n++;
                }
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    function makePanel(comp, ctrl, name, toks, paletteIdx) {
        var sl = comp.layers.addShape();
        sl.name = name;
        sl.comment = panelComment(toks);
        sl.label = 9;
        sl.moveToEnd();

        // effects FIRST: adding an effect invalidates older property refs
        addCtrlRef(sl, ctrl);
        addSlider(sl, "Palette", paletteIdx);

        var root = sl.property("ADBE Root Vectors Group");
        root.addProperty("ADBE Vector Group");
        root.property(1).name = "Panel";
        var contents = root.property(1).property("ADBE Vectors Group");
        contents.addProperty("ADBE Vector Shape - Rect");
        contents.addProperty("ADBE Vector Graphic - Fill");

        applyPanelGeometry(sl, toks);
        panelContents(sl).property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").expression =
            'var c = effect("' + CTRL_FX + '")("Layer");\n' +
            'var i = Math.round(clamp(effect("Palette")("Slider"), 1, ' + PALETTE.length + '));\n' +
            'c.effect("Palette " + i)("Color")';
        return sl;
    }

    // ---------------------------------------------------------------- split

    function nextSplitIndex(ctrl) {
        var fx = ctrl.property("ADBE Effect Parade");
        var top = 0;
        for (var i = 1; i <= fx.numProperties; i++) {
            var nm = fx.property(i).name;
            if (nm.indexOf("Split ") === 0) {
                var k = parseInt(nm.substring(6), 10);
                if (!isNaN(k) && k > top) top = k;
            }
        }
        return top + 1;
    }

    // Palette slot (1..N) a panel currently uses, or 0 if it has no Palette slider.
    function panelPalette(ly) {
        var fx = ly.property("ADBE Effect Parade").property("Palette");
        if (!fx) return 0;
        var v = Math.round(fx.property(1).value);
        return Math.max(1, Math.min(PALETTE.length, v));
    }

    // Least-used palette slot among the comp's panels (ignoring `skip`),
    // never the same as `avoid`, so a split gives the new panel its own color.
    function nextPaletteSlot(comp, skip, avoid) {
        var counts = [], i, best = 0;
        for (i = 0; i <= PALETTE.length; i++) counts.push(0);
        for (i = 1; i <= comp.numLayers; i++) {
            var ly = comp.layer(i);
            if (i === skip.index || !isPanel(ly)) continue;
            counts[panelPalette(ly)]++;
        }
        for (i = 1; i <= PALETTE.length; i++) {
            if (i === avoid) continue;
            if (best === 0 || counts[i] < counts[best]) best = i;
        }
        return best;
    }

    function splitPanels(axis) { // "v" = vertical divider (left/right), "h" = horizontal (top/bottom)
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        var sel = comp.selectedLayers.slice(0);
        var panels = [];
        for (var i = 0; i < sel.length; i++) {
            if (isPanel(sel[i])) panels.push(sel[i]);
        }
        if (panels.length === 0) {
            alert(SCRIPT_NAME + ": select the GF panel(s) to split.");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + ": Split Panel");
        try {
            for (i = 0; i < panels.length; i++) {
                var pnl = panels[i];
                var toks = parseToks(pnl);
                if (!toks) continue;

                var k = nextSplitIndex(ctrl);
                var sName = "Split " + k;
                var a = (axis === "v") ? 0 : 2;       // index of low edge token
                var mid = (sliderVal(ctrl, toks[a]) + sliderVal(ctrl, toks[a + 1])) / 2;
                addSlider(ctrl, sName, mid);

                var sibToks = toks.slice(0);
                toks[a + 1] = sName;   // original keeps low..split
                sibToks[a] = sName;    // sibling gets split..high

                pnl.comment = panelComment(toks);
                applyPanelGeometry(pnl, toks);

                var sib = pnl.duplicate();
                sib.name = "GF Panel s" + k;
                sib.comment = panelComment(sibToks);
                applyPanelGeometry(sib, sibToks);
                sib.property("ADBE Effect Parade").property("Palette").property(1)
                    .setValue(nextPaletteSlot(comp, sib, panelPalette(pnl)));
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- identify

    function identifyPanels() {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        var sel = comp.selectedLayers;
        var lines = [];
        for (var i = 0; i < sel.length; i++) {
            if (!isPanel(sel[i])) continue;
            var toks = parseToks(sel[i]);
            if (!toks) continue;
            lines.push(
                sel[i].name + "\n" +
                "   Left:    " + toks[0] + "  (" + sliderVal(ctrl, toks[0]).toFixed(1) + ")\n" +
                "   Right:  " + toks[1] + "  (" + sliderVal(ctrl, toks[1]).toFixed(1) + ")\n" +
                "   Top:    " + toks[2] + "  (" + sliderVal(ctrl, toks[2]).toFixed(1) + ")\n" +
                "   Bottom: " + toks[3] + "  (" + sliderVal(ctrl, toks[3]).toFixed(1) + ")"
            );
        }
        if (lines.length === 0) {
            alert(SCRIPT_NAME + ": select a GF panel first.");
            return;
        }
        alert(SCRIPT_NAME + " — sliders on 'GridFlow Ctrl' (values are % of comp):\n\n" + lines.join("\n\n"));
    }

    // ---------------------------------------------------------------- grid lines & markers

    var LINE_PREFIX = "GFL|";
    var MARK_PREFIX = "GFM|";
    var LINE_COLOR = [0.62, 0.62, 0.62];

    function isLine(ly) { return ly.comment.indexOf(LINE_PREFIX) === 0; }
    function isMarker(ly) { return ly.comment.indexOf(MARK_PREFIX) === 0; }
    function isLineOrMarker(ly) { return isLine(ly) || isMarker(ly); }

    function ensureColor(layer, name, rgb) {
        var parade = layer.property("ADBE Effect Parade");
        var fx = parade.property(name);
        if (fx === null) {
            fx = parade.addProperty("ADBE Color Control");
            fx.name = name;
            fx.property(1).setValue(rgb);
        }
        return fx;
    }

    function lineNames(ctrl) {
        // Col/Row slider names, sorted by their number
        var fx = ctrl.property("ADBE Effect Parade");
        var cols = [], rows = [];
        for (var i = 1; i <= fx.numProperties; i++) {
            var nm = fx.property(i).name;
            if (/^Col \d+$/.test(nm)) cols.push(nm);
            else if (/^Row \d+$/.test(nm)) rows.push(nm);
        }
        function byNum(a, b) { return parseInt(a.split(" ")[1], 10) - parseInt(b.split(" ")[1], 10); }
        cols.sort(byNum);
        rows.sort(byNum);
        return { cols: cols, rows: rows };
    }

    function topmostIndex(comp, test) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (test(comp.layer(i))) return i;
        }
        return 0;
    }

    function placeAbove(comp, ly, test) {
        // put ly directly above the topmost layer matching test (lines sit on
        // the panels, markers on the lines, content stays above everything)
        var idx = topmostIndex(comp, function (l) { return l !== ly && test(l); });
        if (idx > 0) ly.moveBefore(comp.layer(idx));
    }

    function newShape(comp, ctrl, name, comment) {
        var sl = comp.layers.addShape();
        sl.name = name;
        sl.comment = comment;
        sl.label = 0;
        addCtrlRef(sl, ctrl);   // effects before any property refs
        var tg = sl.property("ADBE Transform Group");
        tg.property("ADBE Anchor Point").setValue([0, 0]);
        tg.property("ADBE Position").setValue([0, 0]);
        return sl;
    }

    function makeLine(comp, ctrl, axis, lineName, aName, bName) {
        var sl = newShape(comp, ctrl, "GF Line " + lineName, LINE_PREFIX + lineName);
        var root = sl.property("ADBE Root Vectors Group");
        root.addProperty("ADBE Vector Group");
        root.property(1).name = "Line";
        var contents = root.property(1).property("ADBE Vectors Group");
        contents.addProperty("ADBE Vector Shape - Group");
        contents.addProperty("ADBE Vector Graphic - Stroke");
        contents = sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");

        var head = 'var c = effect("' + CTRL_FX + '")("Layer");\n';
        var along = (axis === "v") ? "width" : "height";
        var across = (axis === "v") ? "height" : "width";
        var expr = head +
            'var p = c.effect("' + lineName + '")("Slider")/100*thisComp.' + along + ';\n' +
            'var a = c.effect("' + aName + '")("Slider")/100*thisComp.' + across + ';\n' +
            'var b = c.effect("' + bName + '")("Slider")/100*thisComp.' + across + ';\n' +
            'var lo = Math.min(a, b), hi = Math.max(a, b);\n' +
            ((axis === "v") ? 'createPath([[p, lo], [p, hi]], [], [], false);'
                            : 'createPath([[lo, p], [hi, p]], [], [], false);');
        contents.property("ADBE Vector Shape - Group").property("ADBE Vector Shape").expression = expr;
        var stroke = contents.property("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").expression = head + 'c.effect("Line Color")("Color")';
        stroke.property("ADBE Vector Stroke Width").expression = head + 'c.effect("Line Width")("Slider")';
        placeAbove(comp, sl, function (l) { return isPanel(l) || isLine(l); });
        return sl;
    }

    function removeTagged(comp, test) {
        for (var i = comp.numLayers; i >= 1; i--) {
            var ly = comp.layer(i);
            if (test(ly)) { ly.locked = false; ly.remove(); }
        }
    }

    function drawGridLines() {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        var n = lineNames(ctrl);
        if (n.cols.length < 3 && n.rows.length < 3) {
            alert(SCRIPT_NAME + ": this rig has no inner grid lines.\nCreate Grid with at least 2 rows or 2 columns.\n(Split dividers don't get full-length lines.)");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + ": Draw Grid Lines");
        try {
            removeTagged(comp, isLine);     // redraw from scratch, keep markers
            ensureSlider(ctrl, "Line Width", 1);
            ensureColor(ctrl, "Line Color", LINE_COLOR);
            var i;
            var rFirst = n.rows[0], rLast = n.rows[n.rows.length - 1];
            var cFirst = n.cols[0], cLast = n.cols[n.cols.length - 1];
            for (i = 1; i < n.cols.length - 1; i++) makeLine(comp, ctrl, "v", n.cols[i], rFirst, rLast);
            for (i = 1; i < n.rows.length - 1; i++) makeLine(comp, ctrl, "h", n.rows[i], cFirst, cLast);
            // markers stay on top of the lines
            for (i = comp.numLayers; i >= 1; i--) {
                if (isMarker(comp.layer(i))) {
                    placeAbove(comp, comp.layer(i), function (l) { return isPanel(l) || isLine(l) || isMarker(l); });
                }
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    function addMarker(colNum, rowNum) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        var colName = "Col " + colNum, rowName = "Row " + rowNum;
        var fxp = ctrl.property("ADBE Effect Parade");
        if (fxp.property(colName) === null || fxp.property(rowName) === null) {
            alert(SCRIPT_NAME + ": this rig has no '" + colName + "' or no '" + rowName + "'.");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + ": Add Marker");
        try {
            ensureSlider(ctrl, "Marker Size", 12);
            ensureColor(ctrl, "Marker Color", PALETTE[4]);
            var sl = newShape(comp, ctrl, "GF Marker " + colName + " x " + rowName, MARK_PREFIX + colName + "|" + rowName);
            var root = sl.property("ADBE Root Vectors Group");
            root.addProperty("ADBE Vector Group");
            root.property(1).name = "Marker";
            var contents = root.property(1).property("ADBE Vectors Group");
            contents.addProperty("ADBE Vector Shape - Rect");
            contents.addProperty("ADBE Vector Graphic - Fill");
            contents = sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");

            var head = 'var c = effect("' + CTRL_FX + '")("Layer");\n';
            contents.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").expression =
                head + 'var s = c.effect("Marker Size")("Slider");\n[s, s]';
            contents.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Position").expression =
                head + '[c.effect("' + colName + '")("Slider")/100*thisComp.width, c.effect("' + rowName + '")("Slider")/100*thisComp.height]';
            contents.property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").expression =
                head + 'c.effect("Marker Color")("Color")';
            placeAbove(comp, sl, function (l) { return isPanel(l) || isLine(l) || isMarker(l); });
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    function removeLines() {
        var comp = getComp();
        if (!comp) return;
        app.beginUndoGroup(SCRIPT_NAME + ": Remove Lines");
        try {
            removeTagged(comp, isLineOrMarker);
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- remove rig

    function removeRig() {
        var comp = getComp();
        if (!comp) return;

        var doomed = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var ly = comp.layer(i);
            if (ly.comment === CTRL_TAG || ly.comment === LEGACY_PANEL_TAG || isPanel(ly) || isLineOrMarker(ly) ||
                ly.name.indexOf("GridFlow Ctrl") === 0 || ly.name.indexOf("GF Panel") === 0) {
                doomed.push(ly);
            }
        }
        if (doomed.length === 0) {
            alert(SCRIPT_NAME + ": no GridFlow layers found in this comp.");
            return;
        }
        if (!confirm(SCRIPT_NAME + ": delete " + doomed.length + " GridFlow layer(s) from '" + comp.name + "'?\n(Undo-able with Ctrl+Z.)")) return;

        app.beginUndoGroup(SCRIPT_NAME + ": Remove Rig");
        try {
            for (var k = doomed.length - 1; k >= 0; k--) {
                doomed[k].locked = false;
                doomed[k].remove();
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- keyframe layout

    function keyframeLayout(staggerFrames) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": Keyframe Layout");
        try {
            var props = lineProps(ctrl).all;
            var t0 = comp.time;
            for (var i = 0; i < props.length; i++) {
                var p = props[i];
                var t = t0 + i * staggerFrames * comp.frameDuration;
                var k = p.addKey(t);
                p.setValueAtKey(k, p.valueAtTime(t0, false));
                easeKey(p, k);
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- shuffle

    function sortedRandoms(count, lo, hi) {
        var v = [];
        for (var i = 0; i < count; i++) v.push(lo + Math.random() * (hi - lo));
        v.sort(function (a, b) { return a - b; });
        return v;
    }

    function shuffleLayout(staggerFrames) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": Shuffle Layout");
        try {
            var lp = lineProps(ctrl);
            var cols = lp.cols, rows = lp.rows, splits = lp.splits;
            var all = lp.all;

            var newCols = sortedRandoms(cols.length - 2, 10, 90);
            var newRows = sortedRandoms(rows.length - 2, 12, 88);

            var vals = [], i;
            for (i = 0; i < cols.length; i++) {
                vals.push(i === 0 ? 0 : (i === cols.length - 1 ? 100 : newCols[i - 1]));
            }
            for (i = 0; i < rows.length; i++) {
                vals.push(i === 0 ? 0 : (i === rows.length - 1 ? 100 : newRows[i - 1]));
            }
            for (i = 0; i < splits.length; i++) {
                vals.push(15 + Math.random() * 70);
            }

            for (i = 0; i < all.length; i++) {
                var p = all[i];
                var isEdge = (vals[i] === 0 || vals[i] === 100);
                if (p.numKeys > 0) {
                    var t = comp.time + i * staggerFrames * comp.frameDuration;
                    var k = p.addKey(t);
                    p.setValueAtKey(k, isEdge ? p.valueAtTime(comp.time, false) : vals[i]);
                    easeKey(p, k);
                } else if (!isEdge) {
                    p.setValue(vals[i]);
                }
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- clip to panel

    var CLIP_MASK = "GF Clip";

    function clipExpr(toks) {
        // Mask path = the panel's rectangle, converted from comp space into
        // this layer's space, so it keeps cropping while the layer moves/scales.
        return edgeExpr(toks) +
            'var x0 = L*thisComp.width, x1 = R*thisComp.width;\n' +
            'var y0 = T*thisComp.height, y1 = B*thisComp.height;\n' +
            'var sc = transform.scale;\n' +
            'var pts = null;\n' +
            'if (Math.abs(sc[0]) > 0.001 && Math.abs(sc[1]) > 0.001) {\n' +
            '    pts = [fromComp([x0,y0]), fromComp([x1,y0]), fromComp([x1,y1]), fromComp([x0,y1])];\n' +
            '    var ok = true;\n' +
            '    for (var i = 0; i < 4; i++) { if (!isFinite(pts[i][0]) || !isFinite(pts[i][1])) ok = false; }\n' +
            '    if (!ok) pts = null;\n' +
            '}\n' +
            'if (pts === null) pts = [[0,0],[0,0],[0,0],[0,0]];\n' +
            'createPath(pts, [], [], true);';
    }

    function removeClip(ly) {
        var masks = ly.property("ADBE Mask Parade");
        if (masks === null) return;
        var m = masks.property(CLIP_MASK);
        if (m !== null) m.remove();
    }

    function applyClip(ly, toks) {
        var masks = ly.property("ADBE Mask Parade");
        if (masks === null) return false;            // nulls, cameras, lights
        if (masks.property(CLIP_MASK) === null) {
            masks.addProperty("ADBE Mask Atom").name = CLIP_MASK;
        }
        // fresh refs: adding a mask invalidates earlier ones
        masks = ly.property("ADBE Mask Parade");
        var m = masks.property(CLIP_MASK);
        // alone it adds; next to the user's own masks it intersects with them
        m.maskMode = (masks.numProperties > 1) ? MaskMode.INTERSECT : MaskMode.ADD;
        m.property("ADBE Mask Shape").expression = clipExpr(toks);
        return true;
    }

    // ---------------------------------------------------------------- bind to panel

    function bindToPanel(fit, clip) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findCtrl(comp);
        if (!ctrl) { alert(SCRIPT_NAME + ": no GridFlow rig in this comp."); return; }

        var sel = comp.selectedLayers.slice(0);
        var srcPanel = null, targets = [], i;
        for (i = 0; i < sel.length; i++) {
            if (isPanel(sel[i])) {
                if (srcPanel === null) srcPanel = sel[i];
            } else if (sel[i].comment !== CTRL_TAG) {
                targets.push(sel[i]);
            }
        }
        if (srcPanel === null || targets.length === 0) {
            alert(SCRIPT_NAME + ": select the content layer(s) AND one GF panel, then bind.");
            return;
        }
        var toks = parseToks(srcPanel);
        if (!toks) { alert(SCRIPT_NAME + ": could not read that panel's edges."); return; }

        var unclippable = [];
        app.beginUndoGroup(SCRIPT_NAME + ": Bind to Panel");
        try {
            for (i = 0; i < targets.length; i++) {
                var ly = targets[i];
                // effects first (adding effects invalidates held property refs)
                addCtrlRef(ly, ctrl);
                ensurePoint(ly, "Offset (px)", [0, 0]);
                if (fit) ensureSlider(ly, "Fit %", 80);

                var edges = edgeExpr(toks);
                ly.property("ADBE Transform Group").property("ADBE Position").expression =
                    edges + '[(L+R)/2*thisComp.width, (T+B)/2*thisComp.height] + effect("Offset (px)")("Point")';

                if (fit) {
                    ly.property("ADBE Transform Group").property("ADBE Scale").expression =
                        edges +
                        'var cw = (R-L)*thisComp.width;\n' +
                        'var ch = (B-T)*thisComp.height;\n' +
                        'var s = sourceRectAtTime(time, false);\n' +
                        'var k = Math.min(cw/Math.max(s.width,1), ch/Math.max(s.height,1)) * effect("Fit %")("Slider");\n' +
                        '[k, k]';
                }

                if (clip) {
                    if (!applyClip(ly, toks)) unclippable.push(ly.name);
                } else {
                    removeClip(ly);
                }
            }
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
        if (unclippable.length > 0) {
            alert(SCRIPT_NAME + ": bound, but these layers can't take masks so they aren't clipped:\n" + unclippable.join("\n"));
        }
    }

    // ---------------------------------------------------------------- unbind

    function unbindLayers() {
        var comp = getComp();
        if (!comp) return;
        var sel = comp.selectedLayers;
        if (sel.length === 0) { alert(SCRIPT_NAME + ": select the bound layer(s) to unbind."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": Unbind");
        try {
            var n = 0;
            for (var i = 0; i < sel.length; i++) {
                var ly = sel[i];
                if (isPanel(ly) || ly.comment === CTRL_TAG) continue;
                var tg = ly.property("ADBE Transform Group");
                if (tg.property("ADBE Position").expression !== "") { tg.property("ADBE Position").expression = ""; n++; }
                if (tg.property("ADBE Scale").expression !== "") { tg.property("ADBE Scale").expression = ""; }
                removeClip(ly);
            }
            if (n === 0) alert(SCRIPT_NAME + ": nothing to unbind in the selection.");
        } catch (err) {
            alert(SCRIPT_NAME + " error: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------------------------------------------------------------- UI

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 10;

        var gGrid = pal.add("panel", undefined, "Grid");
        gGrid.orientation = "row";
        gGrid.alignChildren = ["left", "center"];
        gGrid.margins = 10;
        gGrid.add("statictext", undefined, "Rows");
        var rowsEt = gGrid.add("edittext", undefined, "1");
        rowsEt.characters = 3;
        gGrid.add("statictext", undefined, "Cols");
        var colsEt = gGrid.add("edittext", undefined, "1");
        colsEt.characters = 3;
        var createBtn = gGrid.add("button", undefined, "Create Grid");
        var removeBtn = gGrid.add("button", undefined, "Remove Rig");

        var gSplit = pal.add("panel", undefined, "Split (select panel first)");
        gSplit.orientation = "row";
        gSplit.alignChildren = ["left", "center"];
        gSplit.margins = 10;
        var splitVBtn = gSplit.add("button", undefined, "Split Vertical |");
        var splitHBtn = gSplit.add("button", undefined, "Split Horizontal —");
        var identBtn = gSplit.add("button", undefined, "Which sliders?");

        var gLay = pal.add("panel", undefined, "Layout");
        gLay.orientation = "row";
        gLay.alignChildren = ["left", "center"];
        gLay.margins = 10;
        gLay.add("statictext", undefined, "Stagger (frames)");
        var stagEt = gLay.add("edittext", undefined, "2");
        stagEt.characters = 3;
        var keyBtn = gLay.add("button", undefined, "Keyframe Layout");
        var shufBtn = gLay.add("button", undefined, "Shuffle");

        var gLines = pal.add("panel", undefined, "Lines (Create Grid lines only, not splits)");
        gLines.orientation = "column";
        gLines.alignChildren = ["left", "top"];
        gLines.margins = 10;
        var lnRow1 = gLines.add("group");
        var drawBtn = lnRow1.add("button", undefined, "Draw Grid Lines");
        var rmLinesBtn = lnRow1.add("button", undefined, "Remove Lines");
        var lnRow2 = gLines.add("group");
        lnRow2.add("statictext", undefined, "Marker at  Col");
        var mkColEt = lnRow2.add("edittext", undefined, "1"); mkColEt.characters = 3;
        lnRow2.add("statictext", undefined, "Row");
        var mkRowEt = lnRow2.add("edittext", undefined, "1"); mkRowEt.characters = 3;
        var markBtn = lnRow2.add("button", undefined, "Add Marker");

        var gCon = pal.add("panel", undefined, "Content");
        gCon.orientation = "row";
        gCon.alignChildren = ["left", "center"];
        gCon.margins = 10;
        var fitCb = gCon.add("checkbox", undefined, "Fit to cell (scale)");
        fitCb.value = true;
        var clipCb = gCon.add("checkbox", undefined, "Clip to panel");
        clipCb.value = true;
        var bindBtn = gCon.add("button", undefined, "Bind Selected to Panel");
        var unbindBtn = gCon.add("button", undefined, "Unbind");

        var tip = pal.add("statictext", undefined, "Start 1x1, carve with splits. Sliders are % of comp (0-100).");
        tip.graphics.foregroundColor = tip.graphics.newPen(tip.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6], 1);

        function num(et, fallback) {
            var v = parseFloat(et.text);
            return isNaN(v) ? fallback : v;
        }

        createBtn.onClick = function () { createGrid(Math.round(num(rowsEt, 1)), Math.round(num(colsEt, 1))); };
        removeBtn.onClick = function () { removeRig(); };
        splitVBtn.onClick = function () { splitPanels("v"); };
        splitHBtn.onClick = function () { splitPanels("h"); };
        identBtn.onClick = function () { identifyPanels(); };
        keyBtn.onClick = function () { keyframeLayout(Math.max(0, num(stagEt, 2))); };
        shufBtn.onClick = function () { shuffleLayout(Math.max(0, num(stagEt, 2))); };
        bindBtn.onClick = function () { bindToPanel(fitCb.value, clipCb.value); };
        unbindBtn.onClick = function () { unbindLayers(); };
        drawBtn.onClick = function () { drawGridLines(); };
        rmLinesBtn.onClick = function () { removeLines(); };
        markBtn.onClick = function () { addMarker(Math.round(num(mkColEt, 1)), Math.round(num(mkRowEt, 1))); };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        if (pal instanceof Window) {
            pal.center();
            pal.show();
        }
        return pal;
    }

    buildUI(thisObj);

})(this);
