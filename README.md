# GridFlow

A free ScriptUI panel for Adobe After Effects that builds animated mosaic layouts: panels of colour that reflow edge to edge when you move a few sliders. It's made for editorial, catalogue-style motion design where the layout itself is the animation.

Everything is driven by expressions on ordinary shape layers, so there are no plug-ins to install and nothing to render out separately.

## Install

1. Download `GridFlow.jsx`.
2. In After Effects, choose **File > Scripts > Install ScriptUI Panel...** and pick the file. Alternatively, copy it into `Support Files/Scripts/ScriptUI Panels` inside your After Effects install folder.
3. Restart After Effects, then open **Window > GridFlow.jsx** and dock the panel.

Tested with After Effects 2026.

## How it works

**Create Grid** adds a controller null (`GridFlow Ctrl`) and one shape-layer panel per cell. The controller holds:

- `Col N` and `Row N` sliders: the grid lines, as a percentage of the comp (0 = left/top edge, 100 = right/bottom edge).
- `Palette 1` to `Palette 5` colours. Each panel has its own `Palette` slider (1 to 5) to pick one.

Panels are expression-bound to the sliders, so animating one line reflows every panel that touches it.

There are two ways to build a layout:

- **Create Grid (rows × cols):** every grid line runs the full width or height, and all panels along it move together. Use this for strict, connected grids.
- **Create Grid 1 × 1, then Split:** select a panel and press **Split Vertical** or **Split Horizontal**. Each split gets its own `Split N` slider that only affects the two panels on either side of it. Use this for editorial layouts like three panels on top and two below.

## Panel reference

| Section | Button | What it does |
|---|---|---|
| Grid | Create Grid | Builds the rig and panels in the active comp. |
| Grid | Remove Rig | Deletes the rig, panels, lines and markers in the comp. |
| Split | Split Vertical / Horizontal | Cuts the selected panel(s) in two with a new divider slider. |
| Split | Which sliders? | Shows which sliders control the selected panel's left, right, top and bottom edges. |
| Layout | Keyframe Layout | Keyframes every slider at the playhead, eased and staggered by the Stagger value. |
| Layout | Shuffle | Randomises the layout (and keyframes it if the sliders are animated). |
| Lines | Draw Grid Lines | Draws a hairline along each inner Create Grid line. Width and colour are set on the controller. |
| Lines | Add Marker | Adds a small square where the given column and row lines cross. |
| Lines | Remove Lines | Deletes all lines and markers. |
| Content | Bind Selected to Panel | Select content layer(s) and one panel, then bind. The content follows the panel. |
| Content | Unbind | Removes the binding so position and scale are manual again. |

When binding content:

- **Fit to cell** scales the content to the panel. Each bound layer gets a `Fit %` slider for its size within the cell and an `Offset (px)` control to nudge it.
- **Clip to panel** adds a `GF Clip` mask so anything past the panel's edges is cropped. Untick it for content that should break out of its cell.

## Tips

- Type slider values instead of dragging. AE's scrub speed makes it easy to overshoot past 0–100, which pushes edges off-screen.
- If a panel disappears, one of its dividers has probably crossed another. Use **Which sliders?** to find it.
- Don't edit the layer comments on GridFlow layers. Panels store their edge sliders there.
- Panels sit at the bottom of the layer stack, as a background. Layers above them cover them.

## License

MIT. See [LICENSE](LICENSE).
