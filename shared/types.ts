// carbon accounting engine types
// see docs/SPEC.md for full specification

export interface ManufacturerProfile {
  id: number;
  manufacturerId: number;
  scope1Tonnes: number;
  scope2Tonnes: number;
  scope3Tonnes: number;
  totalTonnes: number;
  baselineYear: number;
  transitionPlan: TransitionPlan;
  renewablePct: number;
  verifiedBy: "self-reported" | "c2050" | "deimos" | string;
  verificationDate: Date | null;
  verificationCertificateId: string | null;
  maturityLevel: 0 | 1 | 2 | 3 | 4;
}

export interface TransitionPlan {
  targets: { year: number; description: string; targetPct: number }[];
  actions: { action: string; status: "planned" | "in_progress" | "completed"; dueDate: string }[];
}

export interface ProductEmissions {
  id: number;
  productId: number;
  manufacturerProfileId: number;
  carbonPerUnitG: number;
  renewableEnergyPct: number;
  supplyChainScore: number;
  packagingScore: number;
  logisticsScore: number;
  socialImpactScore: number;
  ecosystemScore: number;
  basicNeedsScore: number;
  educationScore: number;
  governanceScore: number;
  dataSource: "manufacturer-submitted" | "estimated" | "deimos-calculated";
  dataConfidence: "high" | "medium" | "low";
}

export interface DimensionalBreakdown {
  [dimension: string]: {
    score: number;
    weight: number;
    weighted: number;
  };
}

export interface GsCalculation {
  id: number;
  productId: number;
  productEmissionId: number;
  calculationMethod: string;
  gsPerUnit: number;
  transitionPct: number;
  offsetPct: number;
  dimensionalBreakdown: DimensionalBreakdown;
  offsetProjectIds: number[];
  status: "draft" | "pending_review" | "approved" | "active" | "superseded";
  approvedBy: string | null;
  approvedAt: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
  notes: string | null;
}

export interface OffsetAllocation {
  id: number;
  gsCalculationId: number;
  projectId: number;
  projectName: string;
  projectType: string;
  projectDimensions: string[];
  tonnesAllocated: number;
  gsFunded: number;
  verified: boolean;
  certificateId: string | null;
}

// deimos handover interface — the contract both engines must satisfy
export interface CalculationInput {
  productId: number;
  manufacturerProfile: ManufacturerProfile;
  productEmissions: ProductEmissions;
  offsetProjects: OffsetAllocation[];
}

export interface CalculationOutput {
  gsPerUnit: number;
  transitionPct: number;
  offsetPct: number;
  dimensionalBreakdown: DimensionalBreakdown;
  calculationMethod: string;
  confidence: "high" | "medium" | "low";
}
