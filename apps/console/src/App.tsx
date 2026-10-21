import { Header } from './components/Header';
import { Card } from './components/ui/Card';
import { EmptyState } from './components/ui/States';

export function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-5">
        <Card title="Overview" description="Live service health">
          <EmptyState title="No panels yet" detail="Panels are added in the following commits." />
        </Card>
      </main>
    </div>
  );
}
