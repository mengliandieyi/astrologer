import assert from "node:assert/strict";
import { parseRssItems, tagStockNewsItem } from "./stockHotNews.js";

const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>半导体板块走强，AI 芯片需求持续升温</title>
    <link>https://example.com/a</link>
    <pubDate>Thu, 14 May 2026 08:00:00 GMT</pubDate>
    <description>英伟达产业链与国产算力方向受到关注。</description>
  </item>
  <item>
    <title><![CDATA[银行股午后回落，市场关注降息预期]]></title>
    <link>https://example.com/b</link>
    <pubDate>Thu, 14 May 2026 07:00:00 GMT</pubDate>
    <description><![CDATA[资金转向防御板块。]]></description>
  </item>
</channel></rss>`;

const items = parseRssItems(xml, "测试源");
assert.equal(items.length, 2);
assert.equal(items[0].title, "半导体板块走强，AI 芯片需求持续升温");
assert.equal(items[0].source, "测试源");
assert.equal(items[1].summary, "资金转向防御板块。");

const tagged = tagStockNewsItem(items[0]);
assert.ok(tagged.tags.includes("AI"));
assert.ok(tagged.tags.includes("半导体"));
assert.ok(tagged.tags.includes("GPU"));
assert.equal(tagged.sentiment, "利好");
assert.equal(tagged.importance_level, "高");
assert.ok(tagged.importance_score >= 70);
assert.match(tagged.importance_reason, /热门行业|影响词|多主题/);

const bank = tagStockNewsItem(items[1]);
assert.ok(bank.tags.includes("银行"));
assert.equal(bank.sentiment, "利空");
assert.ok(bank.importance_score >= 50);
assert.match(bank.importance_reason, /宏观|负面风险|影响词/);

const cpo = tagStockNewsItem({
  title: "CPO 光模块概念走强，800G 光通信订单持续增长",
  url: "https://example.com/cpo",
  source: "测试源",
  published_at: "2026-05-14T08:00:00.000Z",
  summary: "数据中心与算力建设带动光模块需求。",
});
assert.ok(cpo.tags.includes("CPO"));
assert.ok(cpo.tags.includes("光模块"));
assert.ok(cpo.tags.includes("数据中心"));
assert.ok(cpo.importance_score >= 70);

const bullishMarket = tagStockNewsItem({
  title: "AI热潮升温，英伟达盘前涨超2%，韩股续创新高",
  url: "https://example.com/bullish",
  source: "测试源",
  published_at: "2026-05-14T08:00:00.000Z",
  summary: "机构称 AI 硬件进入黄金时代，相关资产表现强劲。",
});
assert.equal(bullishMarket.sentiment, "利好");

const mixedButBullish = tagStockNewsItem({
  title: "AI热潮与通胀压力交织，英伟达盘前涨超2%，韩股续创新高，债市承压",
  url: "https://example.com/mixed-bullish",
  source: "测试源",
  published_at: "2026-05-14T08:00:00.000Z",
  summary: "AI硬件黄金时代延续，相关资产表现强劲。",
});
assert.equal(mixedButBullish.sentiment, "利好");

const atomXml = `<?xml version="1.0"?><rss><channel><item>
  <title>Atom 风格 link 测试</title>
  <link rel="alternate" href="https://example.com/atom" />
  <pubDate>Thu, 14 May 2026 06:00:00 GMT</pubDate>
  <description>摘要</description>
</item></channel></rss>`;
const atomItems = parseRssItems(atomXml, "Atom源");
assert.equal(atomItems.length, 1);
assert.equal(atomItems[0].url, "https://example.com/atom");

const multiPara = `<?xml version="1.0"?><rss><channel><item>
<title>分段</title><link>https://example.com/m</link><pubDate>Thu, 14 May 2026 05:00:00 GMT</pubDate>
<description><![CDATA[<p>第一段文字</p><p>第二段文字</p><br/>第三行]]></description>
</item></channel></rss>`;
const mp = parseRssItems(multiPara, "测");
assert.equal(mp.length, 1);
assert.ok(mp[0].summary.includes("\n"), "summary should keep paragraph breaks");
assert.match(mp[0].summary, /第一段/);
assert.match(mp[0].summary, /第二段/);
assert.match(mp[0].summary, /第三行/);

console.log("stockHotNews tests passed");
