type TushareRequest = {
  api_name: string;
  token: string;
  params?: Record<string, unknown>;
  fields?: string;
};

type TushareResponse<T = any> = {
  code: number;
  msg?: string;
  data?: { fields: string[]; items: any[][] };
};

function tushareToken(): string {
  const t = process.env.TUSHARE_TOKEN?.trim();
  if (!t) throw new Error("tushare_token_not_set");
  return t;
}

export async function tushareQuery<T = any>(args: {
  api_name: string;
  params?: Record<string, unknown>;
  fields?: string[];
}): Promise<Array<Record<string, any>>> {
  const token = tushareToken();
  const body: TushareRequest = {
    api_name: args.api_name,
    token,
    params: args.params ?? {},
    fields: args.fields?.join(","),
  };
  const res = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tushare_http_${res.status}`);
  const json = (await res.json()) as TushareResponse<T>;
  if (json.code !== 0) throw new Error(String(json.msg || `tushare_error_${json.code}`));
  const fields = json.data?.fields || [];
  const items = json.data?.items || [];
  return items.map((row) => {
    const out: Record<string, any> = {};
    for (let i = 0; i < fields.length; i++) out[fields[i]] = row[i];
    return out;
  });
}

