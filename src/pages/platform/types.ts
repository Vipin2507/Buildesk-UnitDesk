export type PlanRow = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxProjects: number;
  maxUnits: number;
};

export type AccountRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  expiresAt: string | null;
  adminEmail: string;
  adminName?: string;
  notes?: string | null;
  createdAt?: string;
  plan: PlanRow;
  limits: { maxUsers: number; maxProjects: number; maxUnits: number };
  usage: { users: number; projects: number; units: number; unavailable?: boolean };
};

export type PlatformDashboard = {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  expired: number;
  emailIndex: number;
  byPlan: { planId: string; planCode: string; count: number }[];
  recent: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: PlanRow;
    adminEmail: string;
    createdAt: string;
    expiresAt: string | null;
  }[];
  expiringSoon: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: PlanRow;
    expiresAt: string | null;
  }[];
};

export type OperatorRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};
