import { RotateCcw, Snail, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { usePolling } from '../../hooks/usePolling';
import { api, type DownstreamBehaviour, type StrategyName } from '../../lib/api';

const PRESETS: { label: string; icon: typeof Zap; value: DownstreamBehaviour }[] = [
  { label: 'Normal', icon: RotateCcw, value: { latencyMs: 50, jitterMs: 20, errorRate: 0 } },
  { label: 'Slow', icon: Snail, value: { latencyMs: 1500, jitterMs: 500, errorRate: 0 } },
  { label: 'Flaky', icon: Zap, value: { latencyMs: 50, jitterMs: 20, errorRate: 0.2 } },
];

const STRATEGY_HELP: Record<StrategyName, string> = {
  hold: 'Original flow: one transaction wraps the payments call, so a connection is held for the whole call.',
  release: 'Fixed flow: short write, release, call payments, short write. No connection is held during network I/O.',
};

export type ScenarioEvent = (label: string) => void;

const describe = (b: DownstreamBehaviour) =>
  `${b.latencyMs}ms ± ${b.jitterMs}ms${b.errorRate ? `, ${Math.round(b.errorRate * 100)}% errors` : ''}`;

export function ScenarioPanel({ onEvent }: { onEvent: ScenarioEvent }) {
  // Server state, polled so changes made from the terminal (make break/fix) show up here.
  const server = usePolling(
    useCallback(async (signal: AbortSignal) => {
      const [downstream, strategy] = await Promise.all([api.getDownstream(signal), api.getStrategy(signal)]);
      return { downstream, strategy: strategy.strategy };
    }, []),
    2000,
  );

  // Local draft while a slider is being dragged.
  const [draft, setDraft] = useState<DownstreamBehaviour | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  // Announce changes that came from elsewhere (terminal, another tab).
  const seen = useRef<{ downstream?: string; strategy?: StrategyName }>({});
  useEffect(() => {
    const d = server.data;
    if (!d) return;
    const key = describe(d.downstream);
    if (seen.current.downstream && seen.current.downstream !== key) onEvent(`Payments set to ${key}`);
    if (seen.current.strategy && seen.current.strategy !== d.strategy) onEvent(`TX_STRATEGY → ${d.strategy}`);
    seen.current = { downstream: key, strategy: d.strategy };
  }, [server.data, onEvent]);

  const behaviour = draft ?? server.data?.downstream;

  const save = (next: DownstreamBehaviour, immediate = false) => {
    setDraft(next);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      async () => {
        try {
          await api.setDownstream(next);
          setSaveError(null);
        } catch (err) {
          setSaveError((err as Error).message);
        } finally {
          setDraft(null);
        }
      },
      immediate ? 0 : 300,
    );
  };

  const setStrategy = async (strategy: StrategyName) => {
    try {
      await api.setStrategy(strategy);
      setSaveError(null);
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  return (
    <Card title="Scenario" description="Payments provider behaviour and the order flow strategy">
      {server.loading ? (
        <LoadingState />
      ) : !server.data || !behaviour ? (
        <ErrorState detail={server.error?.message} />
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">Transaction strategy</p>
            <SegmentedControl<StrategyName>
              label="Transaction strategy"
              value={server.data.strategy}
              onChange={setStrategy}
              options={[
                { value: 'hold', label: 'hold' },
                { value: 'release', label: 'release' },
              ]}
            />
            <p className="text-xs text-text-muted">{STRATEGY_HELP[server.data.strategy]}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted">Payments provider</p>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <Button key={p.label} size="sm" variant="ghost" onClick={() => save(p.value, true)}>
                    <p.icon size={12} aria-hidden />
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <Slider
              label="Latency"
              min={0}
              max={3000}
              step={50}
              value={behaviour.latencyMs}
              format={(v) => `${v} ms`}
              onChange={(latencyMs) => save({ ...behaviour, latencyMs })}
            />
            <Slider
              label="Jitter (±)"
              min={0}
              max={1000}
              step={10}
              value={behaviour.jitterMs}
              format={(v) => `${v} ms`}
              onChange={(jitterMs) => save({ ...behaviour, jitterMs })}
            />
            <Slider
              label="Error rate"
              min={0}
              max={0.5}
              step={0.01}
              value={behaviour.errorRate}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(errorRate) => save({ ...behaviour, errorRate })}
            />
          </div>
          {saveError && (
            <p role="alert" className="text-xs text-danger">
              {saveError}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
