import { z } from "zod";
import { round2 } from "./commission.ts";

export const brokerageMilestoneSchema = z.object({
  collectionPct: z.number().min(0).max(100),
  brokeragePct: z.number().min(0).max(100),
  sortOrder: z.number().int().optional(),
});

export const projectMandateFields = {
  mandateTerm: z.string().optional().nullable(),
  agreedMandateBrokerage: z.number().min(0).max(100).optional().nullable(),
  totalBrokeragePct: z.number().min(0).max(100).optional().nullable(),
  mandateBrokeragePaymentTerm: z.string().optional().nullable(),
  brokerageMilestones: z.array(brokerageMilestoneSchema).optional(),
};

export type BrokerageMilestoneInput = z.infer<typeof brokerageMilestoneSchema>;

export function sumBrokerageMilestones(milestones: BrokerageMilestoneInput[]) {
  return round2(milestones.reduce((s, m) => s + (m.brokeragePct || 0), 0));
}

/** Cumulative brokerage % unlocked when customer collection reaches a threshold. */
export function unlockedBrokeragePct(
  milestones: { collectionPct: number; brokeragePct: number }[],
  collectionPct: number,
) {
  const sorted = [...milestones].sort((a, b) => a.collectionPct - b.collectionPct);
  let unlocked = 0;
  for (const m of sorted) {
    if (collectionPct + 0.05 >= m.collectionPct) unlocked += m.brokeragePct;
  }
  return round2(unlocked);
}

export function brokerageDueAmount(dealValue: number, unlockedPct: number) {
  return round2((dealValue * unlockedPct) / 100);
}

type Tx = {
  brokerageMilestone: {
    deleteMany: (args: { where: { projectId: string } }) => Promise<unknown>;
    createMany: (args: {
      data: {
        projectId: string;
        collectionPct: number;
        brokeragePct: number;
        sortOrder: number;
      }[];
    }) => Promise<unknown>;
  };
  commissionRule: {
    updateMany: (args: {
      where: { projectId: string; active: boolean };
      data: { active: boolean };
    }) => Promise<unknown>;
    create: (args: {
      data: {
        projectId: string;
        name: string;
        type: string;
        value: number;
        active: boolean;
      };
    }) => Promise<unknown>;
    findFirst: (args: {
      where: { projectId: string; active: boolean; type: string };
    }) => Promise<{ id: string } | null>;
    update: (args: {
      where: { id: string };
      data: { value: number; name?: string };
    }) => Promise<unknown>;
  };
};

/** Replace milestones and keep totalBrokeragePct + active % commission rule in sync. */
export async function syncProjectMandate(
  tx: Tx,
  projectId: string,
  input: {
    agreedMandateBrokerage?: number | null;
    brokerageMilestones?: BrokerageMilestoneInput[];
  },
) {
  let totalBrokeragePct: number | undefined;

  if (input.brokerageMilestones) {
    await tx.brokerageMilestone.deleteMany({ where: { projectId } });
    if (input.brokerageMilestones.length) {
      const sorted = [...input.brokerageMilestones].sort(
        (a, b) => a.collectionPct - b.collectionPct,
      );
      await tx.brokerageMilestone.createMany({
        data: sorted.map((m, i) => ({
          projectId,
          collectionPct: m.collectionPct,
          brokeragePct: m.brokeragePct,
          sortOrder: m.sortOrder ?? i,
        })),
      });
      totalBrokeragePct = sumBrokerageMilestones(sorted);
    } else {
      totalBrokeragePct = 0;
    }
  }

  const agreed =
    input.agreedMandateBrokerage != null && !Number.isNaN(input.agreedMandateBrokerage)
      ? input.agreedMandateBrokerage
      : totalBrokeragePct;

  if (agreed != null && agreed > 0) {
    const existing = await tx.commissionRule.findFirst({
      where: { projectId, active: true, type: "percentage" },
    });
    if (existing) {
      await tx.commissionRule.update({
        where: { id: existing.id },
        data: { value: agreed, name: "Mandate brokerage" },
      });
    } else {
      await tx.commissionRule.updateMany({
        where: { projectId, active: true },
        data: { active: false },
      });
      await tx.commissionRule.create({
        data: {
          projectId,
          name: "Mandate brokerage",
          type: "percentage",
          value: agreed,
          active: true,
        },
      });
    }
  }

  return {
    totalBrokeragePct:
      totalBrokeragePct ??
      (input.agreedMandateBrokerage != null ? input.agreedMandateBrokerage : undefined),
  };
}
