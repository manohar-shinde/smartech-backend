export class CreateSiteDto {
  site_name: string;
  address?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  amc_start_date?: string;
  amc_end_date?: string;
  amount_received?: string;
  transactions_details?: string;
  [key: string]: unknown;
}
