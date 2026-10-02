/** Local photo paths for project starters; photos can be added later. */
export const projectStarterImageConfig = [
  { id: "blank", src: null },
  { id: "hospital", src: "/template-assets/starters/hospital.png" },
  { id: "bank", src: "/template-assets/starters/bank.png" },
  { id: "restaurant", src: "/template-assets/starters/restaurant.png" },
  { id: "warehouse", src: "/template-assets/starters/warehouse.png" },
  { id: "customer-service", src: "/template-assets/starters/customer-support.png" },
] as const;

export function projectStarterImage(id: string): string | null {
  return projectStarterImageConfig.find(starter => starter.id === id)?.src ?? null;
}
