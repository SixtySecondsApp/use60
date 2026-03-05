export function CustomerTrackingTab({ customers, plans, isLoading, onRefresh, onDelete }: {
  customers: any[];
  plans: any[];
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}) {
  return <div>Customer Tracking</div>;
}
