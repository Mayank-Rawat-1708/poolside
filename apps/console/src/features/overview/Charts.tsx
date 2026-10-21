import type { ReactNode } from 'react';
import { TimeSeriesChart, type Marker } from '../../components/charts/TimeSeriesChart';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatRate } from '../../lib/format';
import { WINDOW_SECONDS, type OverviewData } from './useOverview';

const seconds = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`);
const count = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

interface Props {
  data: OverviewData | undefined;
  loading: boolean;
  error: Error | undefined;
  markers: Marker[];
  updatedAt: number | undefined;
}

export function Charts({ data, loading, error, markers, updatedAt = 0 }: Props) {
  const window = { start: updatedAt - WINDOW_SECONDS * 1000, end: updatedAt };
  const body = (chart: ReactNode) => {
    if (loading) return <LoadingState className="h-[204px]" />;
    if (error && !data) return <ErrorState className="h-[204px]" detail={`Prometheus: ${error.message}`} />;
    return chart;
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card title="Latency" description="Server-side, all routes">
        {body(
          <TimeSeriesChart
            format={seconds}
            window={window}
            markers={markers}
            series={[
              { key: 'p50', label: 'p50', tone: 'text-muted', data: data?.p50 },
              { key: 'p95', label: 'p95', tone: 'accent', data: data?.p95 },
              { key: 'p99', label: 'p99', tone: 'warning', data: data?.p99 },
            ]}
          />,
        )}
      </Card>
      <Card title="Throughput and errors" description="Requests per second">
        {body(
          <TimeSeriesChart
            format={formatRate}
            window={window}
            markers={markers}
            series={[
              { key: 'rps', label: 'all requests', tone: 'accent', data: data?.rps },
              { key: 'err', label: '5xx', tone: 'danger', data: data?.errorRps },
            ]}
          />,
        )}
      </Card>
      <Card title="Connection pool" description="Checked-out connections and queued callers">
        {body(
          <TimeSeriesChart
            format={count}
            window={window}
            markers={markers}
            series={[
              { key: 'inUse', label: 'in use', tone: 'accent', data: data?.poolInUse },
              { key: 'max', label: 'max', tone: 'text-muted', dashed: true, data: data?.poolMax },
              { key: 'waiting', label: 'waiting', tone: 'danger', data: data?.poolWaiting },
            ]}
          />,
        )}
      </Card>
      <Card title="Where request time goes" description="p99 of each stage">
        {body(
          <TimeSeriesChart
            format={seconds}
            window={window}
            markers={markers}
            series={[
              { key: 'acquire', label: 'waiting for connection', tone: 'danger', data: data?.acquireP99 },
              { key: 'downstream', label: 'payments call', tone: 'accent', data: data?.downstreamP99 },
              { key: 'query', label: 'SQL query', tone: 'success', data: data?.queryP99 },
            ]}
          />,
        )}
      </Card>
    </div>
  );
}
