export class UpsertOrganizationDto {
  logo?: string;
  company_name?: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gst?: string;
  pan?: string;
  site?: string;
  [key: string]: unknown;
}
