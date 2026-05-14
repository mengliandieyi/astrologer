import assert from "node:assert/strict";
import { interpretStandaloneDream } from "./dreamInterpreter.js";

const chased = interpretStandaloneDream("我梦见自己在陌生街道被人追赶，跑到一栋很大的房子里，怎么都找不到出口，醒来后很害怕。");

assert.match(chased, /追赶/);
assert.match(chased, /房子/);
assert.match(chased, /迷路|出口/);
assert.match(chased, /恐惧|害怕/);
assert.match(chased, /一句话判断/);
assert.match(chased, /组合解释/);
assert.match(chased, /民俗象征/);
assert.match(chased, /现实映射/);
assert.match(chased, /近期提醒/);
assert.match(chased, /压力逼近/);
assert.match(chased, /安全感/);
assert.match(chased, /解决路径|方向/);
assert.doesNotMatch(chased, /固定问题清单/);
assert.doesNotMatch(chased, /本页由站内固定模板生成/);

const money = interpretStandaloneDream("梦见自己捡到很多钱，又担心被别人拿走。");

assert.match(money, /钱财/);
assert.match(money, /得失感|资源|安全感/);
assert.match(money, /得失/);
assert.match(money, /账目|预算|合同|账户/);
assert.match(money, /仅供文化娱乐参考/);

const unknown = interpretStandaloneDream("梦见一个蓝色盒子放在桌上，我一直看着它。");

assert.match(unknown, /一句话判断/);
assert.match(unknown, /通用象征/);
assert.match(unknown, /场景|人物|动作|情绪/);

console.log("dreamInterpreter tests passed");
