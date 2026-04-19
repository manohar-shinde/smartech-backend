export class Breakdown {
  id?: string;
  organization_id?: string;
  site_id?: string;
  assigned_to?: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  reported_by?: string;
  images?: string[];
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
}
