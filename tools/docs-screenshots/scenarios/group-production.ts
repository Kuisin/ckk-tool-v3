import { designProgramVersions } from "./design-program-versions";
import { designProgramsMemo } from "./design-programs-memo";
import { kioskWoList } from "./kiosk-wo-list";
import { machineModelsMaster } from "./machine-models-master";
import { stepDueDateBoard } from "./step-due-date-board";
import type { AnyScenario } from "./types";
import { workOrderMarkingPrint } from "./work-order-marking-print";

export const productionScenarios: AnyScenario[] = [
  machineModelsMaster,
  designProgramsMemo,
  designProgramVersions,
  stepDueDateBoard,
  kioskWoList,
  workOrderMarkingPrint,
];
