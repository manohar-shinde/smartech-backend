export class UpdateBreakdownDto {
  assigned_to?: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  images?: string[];
  resolved_at?: string | null;
}
