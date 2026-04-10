import { Injectable } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { AddStaffDto, STAFF_ROLES } from './dto/add-staff.dto';

@Injectable()
export class StaffService {
  async addStaffMember(
    ownerUserId: string,
    payload: AddStaffDto,
  ): Promise<any> {
    try {
      const ownerContext = await this.getOwnerContext(ownerUserId);

      if (!ownerContext.success) {
        return ownerContext;
      }

      if (!this.isValidEmail(payload?.email)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      if (!payload?.phone) {
        return {
          success: false,
          message: 'Phone is required',
        };
      }

      if (!payload?.role || !STAFF_ROLES.includes(payload.role)) {
        return {
          success: false,
          message: 'Role must be one of STAFF, TECHNICIAN, HELPER',
        };
      }

      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: payload.email,
          password: payload.phone,
          phone: payload.phone,
          email_confirm: true,
        });

      if (authError) {
        return {
          success: false,
          message: authError.message,
        };
      }

      const staffUserId = authUser.user.id;

      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            id: staffUserId,
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            address: payload.address,
            role: payload.role,
            organization_id: ownerContext.organizationId,
          },
        ])
        .select()
        .single();

      if (error) {
        await supabase.auth.admin.deleteUser(staffUserId);

        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'Staff member created successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async findAllForOwner(ownerUserId: string): Promise<any> {
    try {
      const ownerContext = await this.getOwnerContext(ownerUserId);

      if (!ownerContext.success) {
        return ownerContext;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, address, role, organization_id')
        .eq('organization_id', ownerContext.organizationId)
        .in('role', [...STAFF_ROLES]);

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'Staff members fetched successfully',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  private async getOwnerContext(ownerUserId: string): Promise<any> {
    if (!ownerUserId) {
      return {
        success: false,
        message: 'User is not authenticated',
      };
    }

    const { data: ownerUser, error: ownerUserError } = await supabase
      .from('users')
      .select('role')
      .eq('id', ownerUserId)
      .single();

    if (ownerUserError) {
      return {
        success: false,
        message: ownerUserError.message,
      };
    }

    if (ownerUser?.role !== 'OWNER') {
      return {
        success: false,
        message: 'Only owner can manage staff members',
      };
    }

    const { data: organizations, error: organizationError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (organizationError) {
      return {
        success: false,
        message: organizationError.message,
      };
    }

    const organizationId = organizations?.[0]?.id as string | undefined;

    if (!organizationId) {
      return {
        success: false,
        message: 'Organization not found for the logged-in owner',
      };
    }

    return {
      success: true,
      organizationId,
    };
  }

  private isValidEmail(email: string | undefined): boolean {
    if (!email) {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
