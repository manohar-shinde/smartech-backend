import { Injectable } from '@nestjs/common';
import { getUserSupabaseClient, supabase } from '../supabase/supabase.client';
import { AddStaffDto, STAFF_ROLES } from './dto/add-staff.dto';
import { DeleteStaffDto } from './dto/delete-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

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
            is_deleted: false,
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
          member_role: createdUser.role,
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
        .select('id, user_id, organization_id, created_at')
        .eq('organization_id', ownerContext.organizationId)
        .or('is_deleted.eq.false,is_deleted.is.null')
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
            .select('id, name, email, phone, address, active, role')
            .in('id', userIds)
            .in('role', [...STAFF_ROLES])
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

      const staffMembers = (members || []).filter((member: any) =>
        usersById.has(member.user_id),
      );

      return {
        success: true,
        message: 'Staff members fetched successfully',
        data: staffMembers.map((member: any) => {
          const user = usersById.get(member.user_id);
          return {
            id: member.user_id,
            name: user?.name ?? null,
            email: user?.email ?? null,
            phone: user?.phone ?? null,
            address: user?.address ?? null,
            active: user?.active ?? true,
            role: user?.role ?? null,
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

  async softDeleteStaff(
    ownerUserId: string,
    payload: DeleteStaffDto,
  ): Promise<any> {
    try {
      const loaded = await this.loadStaffMemberForOwner(
        ownerUserId,
        payload.organization_member_id,
      );

      if (!loaded.success) {
        return loaded;
      }

      const member = loaded.member;

      if (member.is_deleted === true) {
        return {
          success: false,
          message: 'Staff member is already removed',
        };
      }

      const deletedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('organization_members')
        .update({
          is_deleted: true,
          deleted_at: deletedAt,
        })
        .eq('id', member.id)
        .eq('organization_id', member.organization_id);

      if (updateError) {
        return {
          success: false,
          message: updateError.message,
        };
      }

      return {
        success: true,
        message: 'Staff member removed successfully',
        data: {
          organization_member_id: member.id,
          is_deleted: true,
          deleted_at: deletedAt,
        },
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async updateStaff(ownerUserId: string, payload: UpdateStaffDto): Promise<any> {
    try {
      const hasAnyField =
        payload.name !== undefined ||
        payload.phone !== undefined ||
        payload.email !== undefined ||
        payload.address !== undefined ||
        payload.role !== undefined;

      if (!hasAnyField) {
        return {
          success: false,
          message:
            'Provide at least one field to update (name, phone, email, address, role)',
        };
      }

      const loaded = await this.loadStaffMemberForOwner(
        ownerUserId,
        payload.organization_member_id,
      );

      if (!loaded.success) {
        return loaded;
      }

      const member = loaded.member;

      if (member.is_deleted === true) {
        return {
          success: false,
          message: 'Cannot update a removed staff member',
        };
      }

      const name =
        payload.name !== undefined ? payload.name.trim() : undefined;
      if (name !== undefined && name.length === 0) {
        return {
          success: false,
          message: 'Name cannot be empty',
        };
      }

      const phone =
        payload.phone !== undefined ? payload.phone.trim() : undefined;
      if (phone !== undefined && phone.length === 0) {
        return {
          success: false,
          message: 'Phone cannot be empty',
        };
      }

      const emailNorm =
        payload.email !== undefined
          ? payload.email.trim().toLowerCase()
          : undefined;
      if (emailNorm !== undefined) {
        if (!this.isValidEmail(emailNorm)) {
          return {
            success: false,
            message: 'Invalid email format',
          };
        }

        const { data: emailOwner, error: emailCheckError } = await supabase
          .from('users')
          .select('id')
          .eq('email', emailNorm)
          .neq('id', member.user_id)
          .maybeSingle();

        if (emailCheckError) {
          return {
            success: false,
            message: emailCheckError.message,
          };
        }

        if (emailOwner) {
          return {
            success: false,
            message: 'Email is already in use',
          };
        }
      }

      const authUpdate: {
        email?: string;
        phone?: string;
        password?: string;
        email_confirm?: boolean;
      } = {};

      if (emailNorm !== undefined) {
        authUpdate.email = emailNorm;
        authUpdate.email_confirm = true;
      }
      if (phone !== undefined) {
        authUpdate.phone = phone;
        authUpdate.password = phone;
      }

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await supabase.auth.admin.updateUserById(
          member.user_id,
          authUpdate,
        );

        if (authError) {
          return {
            success: false,
            message: authError.message,
          };
        }
      }

      const userPatch: Record<string, string | null> = {};
      if (name !== undefined) {
        userPatch.name = name;
      }
      if (phone !== undefined) {
        userPatch.phone = phone;
      }
      if (emailNorm !== undefined) {
        userPatch.email = emailNorm;
      }
      if (payload.address !== undefined) {
        const trimmed = payload.address.trim();
        userPatch.address = trimmed.length === 0 ? null : trimmed;
      }
      if (payload.role !== undefined) {
        userPatch.role = payload.role;
      }

      if (Object.keys(userPatch).length > 0) {
        const { error: userError } = await supabase
          .from('users')
          .update(userPatch)
          .eq('id', member.user_id);

        if (userError) {
          return {
            success: false,
            message: userError.message,
          };
        }
      }

      const { data: userRow, error: userFetchError } = await supabase
        .from('users')
        .select('id, name, email, phone, address, active, role, created_at')
        .eq('id', member.user_id)
        .single();

      if (userFetchError) {
        return {
          success: false,
          message: userFetchError.message,
        };
      }

      const memberRoleAfter =
        payload.role !== undefined ? payload.role : member.role;

      return {
        success: true,
        message: 'Staff member updated successfully',
        data: {
          organization_member_id: member.id,
          organization_id: member.organization_id,
          user: userRow,
          member_role: memberRoleAfter,
        },
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /**
   * Resolves a staff row in `organization_members` for the owner's organization
   * (`organizations.owner_id`). Staff is identified by `users.role` (STAFF / TECHNICIAN / HELPER).
   */
  private async loadStaffMemberForOwner(
    ownerUserId: string,
    organizationMemberId: string,
  ): Promise<
    | {
        success: true;
        member: {
          id: string;
          user_id: string;
          organization_id: string;
          role: string;
          is_deleted: boolean | null;
        };
      }
    | { success: false; message: string }
  > {
    const ownerContext = await this.getOwnerContext(ownerUserId);

    if (!ownerContext.success) {
      return ownerContext;
    }

    const { data: row, error } = await supabase
      .from('organization_members')
      .select(
        'id, user_id, organization_id, is_deleted, organizations!inner(id, owner_id)',
      )
      .eq('id', organizationMemberId)
      .eq('organization_id', ownerContext.organizationId)
      .eq('organizations.owner_id', ownerUserId)
      .maybeSingle();

    if (error) {
      return { success: false, message: error.message };
    }

    if (!row) {
      return { success: false, message: 'Staff member not found' };
    }

    const org = (row as { organizations?: { owner_id?: string } })
      .organizations;
    const orgOwnerId = org?.owner_id;

    if (orgOwnerId && row.user_id === orgOwnerId) {
      return {
        success: false,
        message: 'Cannot modify the organization owner as staff',
      };
    }

    const { data: staffUser, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', row.user_id)
      .single();

    if (userError) {
      return { success: false, message: userError.message };
    }

    const userRole = staffUser?.role as string | undefined;
    if (!userRole || !STAFF_ROLES.includes(userRole as (typeof STAFF_ROLES)[number])) {
      return { success: false, message: 'Staff member not found' };
    }

    return {
      success: true,
      member: {
        id: row.id,
        user_id: row.user_id,
        organization_id: row.organization_id,
        role: userRole,
        is_deleted: row.is_deleted,
      },
    };
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
