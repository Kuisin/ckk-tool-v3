import { designProgramsMemo } from "./design-programs-memo";
import { kioskWoList } from "./kiosk-wo-list";
import { stepDueDateBoard } from "./step-due-date-board";
import type { AnyScenario } from "./types";
import { workOrderMarkingPrint } from "./work-order-marking-print";

export const productionScenarios: AnyScenario[] = [
  designProgramsMemo,
  stepDueDateBoard,
  kioskWoList,
  workOrderMarkingPrint,
];
