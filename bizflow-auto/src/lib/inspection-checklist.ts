export const inspectionChecklist = [
  { category: "Engine", items: ["Engine oil", "Coolant", "Belts", "Battery", "Leaks", "Engine noise"] },
  { category: "Brakes", items: ["Brake pads", "Brake discs", "Brake fluid", "Hand brake"] },
  { category: "Suspension", items: ["Shock absorbers", "Bushes", "Ball joints", "Steering components"] },
  { category: "Tyres", items: ["Front left", "Front right", "Rear left", "Rear right", "Spare tyre"] },
  { category: "Electrical", items: ["Battery", "Alternator", "Lights", "Sensors"] },
] as const;

export const inspectionStatuses = [
  "GOOD",
  "ATTENTION_REQUIRED",
  "CRITICAL",
  "NOT_CHECKED",
] as const;
