import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export function Placeholder(props: { title: string; hint: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-12">
      <div className="flex items-center justify-between gap-3 py-4">
        <div className="text-sm font-extrabold tracking-[0.18em] text-[var(--text-strong)]">知行馆</div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/">回到工作台</Link>
        </Button>
      </div>
      <div className="glass rounded-[22px] p-6 shadow-soft">
        <div className="text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)]">PAGE</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-strong)] sm:text-3xl">{props.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{props.hint}</p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">返回</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

