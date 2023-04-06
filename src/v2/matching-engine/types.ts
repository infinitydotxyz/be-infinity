export interface MatchingEngineStatus {
  isSynced: boolean;
  matchingEngine: {
    healthStatus: {
      status: 'healthy' | 'unhealthy';
    };
    jobsProcessing: number;
  };
  orderRelay: {
    healthStatus: {
      status: 'healthy' | 'unhealthy';
    };
    jobsProcessing: number;
  };
  executionEngine: {
    healthStatus: {
      status: 'healthy' | 'unhealthy';
    };
    jobsProcessing: number;
  };
  averages: {
    matchingEngine: {
      globalAverage: number | null;
      collectionAverage: number | null;
    };
    executionEngine: {
      globalAverage: number | null;
      collectionAverage: number | null;
    };
  };
}
