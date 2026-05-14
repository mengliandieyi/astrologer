const MAP: Record<string, string> = {
  unauthorized: "未登录或登录已过期，请重新登录",
  forbidden: "无权操作",
  not_found: "目标不存在",
  symbol_required: "请填写股票代码",
  symbol_invalid: "股票代码格式不正确（示例：600519 或 600519.SH）",
  strategy_invalid: "策略类型不正确",
  run_id_invalid: "运行编号不正确",
  question_required: "请输入问题",
  no_market_data: "暂无市场数据",
  market_data_not_configured: "市场数据通道未配置",
  already_syncing: "正在同步中，请稍后再试",
  run_in_progress: "该次运行仍在进行中，请稍后再删除",
  invalid_date_range: "日期范围不正确",
  from_to_required: "请提供时间范围",
  id_required: "缺少 ID 参数",
  profile_reorder_invalid: "档案顺序无效，请刷新后重试",
  ordered_ids_required: "请提供有效的档案顺序",
  chart_id_required: "缺少命盘编号",
  dream_text_too_short: "梦境描述过短，请至少写约 10 个字",
  dream_text_too_long: "梦境描述过长，请控制在 2000 字以内",
  chart_not_owned: "只能对本人保存的命盘使用解梦",
  ai_failed: "AI 解梦暂时失败，请稍后重试",
  no_chart_for_profile: "该档案下还没有已保存的命盘，需先在八字页完成一次排盘",
};

const STATUS_FALLBACK: Record<number, string> = {
  400: "请求参数有误",
  401: "未登录或登录已过期，请重新登录",
  403: "无权操作",
  404: "目标不存在",
  409: "操作冲突，请稍后重试",
  422: "数据校验失败",
  429: "请求过于频繁，请稍后再试",
  500: "服务器内部错误",
  502: "无法连接后端（网关 502）。请先在项目根目录运行 npm run dev 启动 API，或一键运行 npm run dev:all；并确认根目录 .env 的 PORT 与后端实际监听端口一致。",
  503: "服务暂不可用（503）。若使用数据库，请检查是否已启动并可连接。",
  504: "网关超时（504）。后端长时间无响应，请检查数据库或网络后重试。",
};

export function friendlyError(code: string | undefined, status?: number): string {
  if (code && MAP[code]) return MAP[code];
  const c = code?.trim();
  // 后端不少路由在 catch 里统一 res.status(400)，body.error 实为 DB/JSON 等英文信息；
  // 若先套 STATUS_FALLBACK[400]，会一律变成「请求参数有误」，与真实原因不符。
  if (status === 400 && c) {
    return `请求被拒（400）：${c.length > 160 ? `${c.slice(0, 160)}…` : c}`;
  }
  if (typeof status === "number" && STATUS_FALLBACK[status]) return STATUS_FALLBACK[status];
  if (code && code.length < 80 && /[\u4e00-\u9fa5]/.test(code)) return code;
  return "请求失败，请稍后重试";
}
