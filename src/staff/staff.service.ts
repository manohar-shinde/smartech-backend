import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { AddStaffDto, STAFF_ROLES } from './dto/add-staff.dto';

@Injectable()
export class StaffService {
  async addStaffMember(
    ownerUserId: string,
    token: string,
    payload: AddStaffDto,
  ): Promise<any> {
    try {
      if (!token) {
        return {
          success: false,
          message: 'Access token is required',
        };
      }

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

      const { data: createdUser, error: userError } = await supabase
        .from('users')
        .insert([
          {
            id: staffUserId,
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            address: payload.address,
            role: payload.role,
          },
        ])
        .select()
        .single();

      if (userError) {
        await supabase.auth.admin.deleteUser(staffUserId);

        return {
          success: false,
          message: userError.message,
        };
      }

      const userSupabase = getUserSupabaseClient(token);
      const { data: organizationMember, error: memberError } = await userSupabase
        .from('organization_members')
        .insert([
          {
            user_id: staffUserId,
            organization_id: ownerContext.organizationId,
            role: payload.role,
          },
        ])
        .select()
        .single();

      if (memberError) {
        await supabase.from('users').delete().eq('id', staffUserId);
        await supabase.auth.admin.deleteUser(staffUserId);
        return {
          success: false,
          message: memberError.message,
        };
      }

      return {
        success: true,
        message: 'Staff member created successfully',
        data: {
          ...createdUser,
          organization_member_id: organizationMember.id,
          organization_id: organizationMember.organization_id,
          member_role: organizationMember.role,
        },
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

      const { data: members, error } = await supabase
        .from('organization_members')
        .select('id, user_id, organization_id, role, created_at')
        .eq('organization_id', ownerContext.organizationId)
        .in('role', [...STAFF_ROLES])
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      const userIds = (members || []).map((member: any) => member.user_id);
      const { data: users, error: usersError } = userIds.length
        ? await supabase
            .from('users')
            .select('id, name, email, phone, address, active')
            .in('id', userIds)
        : { data: [], error: null as any };

      if (usersError) {
        return {
          success: false,
          message: usersError.message,
        };
      }

      const usersById = new Map(
        (users || []).map((user: any) => [user.id, user]),
      );

      return {
        success: true,
        message: 'Staff members fetched successfully',
        data: (members || []).map((member: any) => {
          const user = usersById.get(member.user_id);
          return {
          id: member.user_id,
          name: user?.name ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          address: user?.address ?? null,
          active: user?.active ?? true,
          role: member.role,
          organization_id: member.organization_id,
          organization_member_id: member.id,
          joined_at: member.created_at,
          };
        }),
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
