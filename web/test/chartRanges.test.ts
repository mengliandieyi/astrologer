import assert from "node:assert/strict";
import { visibleBarsRange } from "../src/lib/chartRanges";

assert.deepEqual(visibleBarsRange(1000, 60, [5, 20, 60]), { from: 640, to: 999 });
assert.deepEqual(visibleBarsRange(1000, 60, [250]), { from: 440, to: 999 });
assert.equal(visibleBarsRange(1000, null, [60]), null);

