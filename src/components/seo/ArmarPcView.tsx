import { PcBuilder } from '@/components/pc-builder/PcBuilder';

// Se conserva la entrada del armador existente.
export function ArmarPcView({ budget, submitted }: { budget: number | null; submitted: boolean }) {
  return <PcBuilder initialBudget={budget} invalidBudget={submitted && !budget} />;
}
