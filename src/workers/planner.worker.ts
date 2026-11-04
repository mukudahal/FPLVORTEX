import { runPlannerSimulation, type PlannerSimulationInput } from '../lib/repoModel/compassPlanner';

self.onmessage = (event: MessageEvent<PlannerSimulationInput>) => {
  try {
    self.postMessage({ result: runPlannerSimulation(event.data, progress => self.postMessage({ progress })) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Simulation failed. Refresh the data and try again.' });
  }
};

