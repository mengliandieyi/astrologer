import assert from "node:assert/strict";
import { buildDreamFortuneContext } from "./dreamFortuneContext.js";

const context = buildDreamFortuneContext(
  {
    fortune_cycles: {
      da_yun: [
        { gan_zhi: "乙巳", start_year: 2018, end_year: 2027, summary: "事业压力与转型并行", career: "岗位变化", wealth: "支出增多" },
      ],
      liu_nian_preview: [
        { year: 2026, gan_zhi: "丙午", summary: "火势偏旺，事务推进较急", career: "事务加速", love: "沟通易急" },
      ],
      liu_yue_preview: [
        { year: 2026, month: 5, gan_zhi: "癸巳", summary: "近期人际与执行压力明显", health: "注意休息" },
      ],
    },
  },
  new Date("2026-05-14T08:00:00.000Z")
);

assert.match(context, /当前日期/);
assert.match(context, /2026-05-14/);
assert.match(context, /当前大运/);
assert.match(context, /乙巳/);
assert.match(context, /当前流年/);
assert.match(context, /丙午/);
assert.match(context, /当前流月/);
assert.match(context, /癸巳/);
assert.match(context, /岗位变化/);
assert.match(context, /事务加速/);
assert.match(context, /近期人际/);

console.log("dreamFortuneContext tests passed");
