import { Injectable } from '@nestjs/common';
import {
  authClient,
  createEphemeralAnonClient,
  supabase,
} from '../supabase/supabase.client';
import { CreateUserDto } from './create-user.dto';

@Injectable()
export class UserService {
  constructor() {}
  // Create a new user in the Supabase 'users' table
  async createUser(createUserDto: CreateUserDto): Promise<any> {
    try {
      const name =
        typeof createUserDto.name === 'string'
          ? createUserDto.name.trim()
          : '';
      if (!name) {
        return {
          success: false,
          message: 'Name is required',
        };
      }

      const phoneRaw =
        typeof createUserDto.phone === 'string' ? createUserDto.phone : '';
      const phone = phoneRaw.trim();
      if (!phone) {
        return {
          success: false,
          message: 'Phone is required',
        };
      }
      if (!this.isValidPhone(phone)) {
        return {
          success: false,
          message: 'Invalid phone number format',
        };
      }

      const emailTrimmed =
        typeof createUserDto.email === 'string'
          ? createUserDto.email.trim()
          : '';
      if (!emailTrimmed) {
        return {
          success: false,
          message: 'Email is required',
        };
      }
      if (!this.isValidEmail(emailTrimmed)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      const passwordStr =
        typeof createUserDto.password === 'string'
          ? createUserDto.password
          : '';
      if (!passwordStr) {
        return {
          success: false,
          message: 'Password is required',
        };
      }
      if (passwordStr.length < 6) {
        return {
          success: false,
          message: 'Password must be at least 6 characters',
        };
      }

      const roleRaw = createUserDto.role;
      if (
        roleRaw === undefined ||
        roleRaw === null ||
        (typeof roleRaw === 'string' && roleRaw.trim() === '')
      ) {
        return {
          success: false,
          message: 'Role is required',
        };
      }
      const role = roleRaw as CreateUserDto['role'];
      const allowedRoles: CreateUserDto['role'][] = [
        'SUPER_ADMIN',
        'OWNER',
        'CUSTOMER',
        'STAFF',
      ];
      if (!allowedRoles.includes(role)) {
        return {
          success: false,
          message:
            'Role must be one of SUPER_ADMIN, OWNER, CUSTOMER, or STAFF',
        };
      }

      // 1️⃣ Create user in Supabase Auth
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: emailTrimmed,
          password: passwordStr,
          phone,
          email_confirm: true,
        });

      if (authError) {
        return {
          success: false,
          message: authError.message,
        };
      }

      const userId = authUser.user?.id;
      if (!userId) {
        return {
          success: false,
          message: 'Unable to create auth user',
        };
      }

      // 2️⃣ Insert profile in public.users
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            id: userId,
            name,
            email: emailTrimmed,
            phone,
            address: createUserDto.address,
            role,
          },
        ])
        .select();

      if (error) {
        await supabase.auth.admin.deleteUser(userId);
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'User created successfully',
        data: data[0],
      };
    } catch (err) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /** Public.users lookup (service role). Email compared trimmed, case-sensitive per DB. */
  async checkEmailExists(email: string | undefined): Promise<any> {
    try {
      const emailTrimmed =
        typeof email === 'string' ? email.trim() : String(email ?? '').trim();
      if (!emailTrimmed) {
        return {
          success: false,
          message: 'Email is required',
        };
      }
      if (!this.isValidEmail(emailTrimmed)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('email', emailTrimmed)
        .limit(1);

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        exists: Array.isArray(data) && data.length > 0,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /** Public.users lookup (service role). Phone compared as trimmed string (same as registration). */
  async checkPhoneExists(phone: string | undefined): Promise<any> {
    try {
      const phoneRaw =
        typeof phone === 'string' ? phone : String(phone ?? '');
      const phoneTrimmed = phoneRaw.trim();
      if (!phoneTrimmed) {
        return {
          success: false,
          message: 'Phone is required',
        };
      }
      if (!this.isValidPhone(phoneTrimmed)) {
        return {
          success: false,
          message: 'Invalid phone number format',
        };
      }

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneTrimmed)
        .limit(1);

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        exists: Array.isArray(data) && data.length > 0,
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  // Login
  async loginUser(email: string, password: string): Promise<any> {
    try {
      const emailTrimmed =
        typeof email === 'string' ? email.trim() : String(email ?? '').trim();

      if (!emailTrimmed) {
        return {
          success: false,
          message: 'Email is required',
        };
      }

      if (!this.isValidEmail(emailTrimmed)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      const passwordStr =
        typeof password === 'string' ? password : String(password ?? '');
      if (!passwordStr) {
        return {
          success: false,
          message: 'Password is required',
        };
      }

      // Use authClient (anon key), not the service-role supabase singleton.
      // signInWithPassword on the service client attaches a user session to that
      // singleton so later admin .from() calls run as that user and hit RLS
      // (e.g. staff insert into users for another id fails).
      const { data, error } = await authClient.auth.signInWithPassword({
        email: emailTrimmed,
        password: passwordStr,
      });

      if (error) {
        return {
          success: false,
          message: this.mapSignInAuthErrorMessage(error),
        };
      }

      const authUserId = data.user?.id;

      if (
        !authUserId ||
        !data.session?.access_token ||
        !data.session?.refresh_token
      ) {
        return {
          success: false,
          message: 'Invalid login session',
        };
      }

      const { data: publicUser, error: publicUserError } = await authClient
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();

      if (publicUserError) {
        if (publicUserError.code === 'PGRST116') {
          return {
            success: false,
            message:
              'No profile found for this account. Please contact support.',
          };
        }
        return {
          success: false,
          message: publicUserError.message,
        };
      }

      return {
        success: true,
        message: 'User logged in successfully',
        data: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user: publicUser,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async refreshUserSession(refreshToken: string): Promise<any> {
    try {
      if (!refreshToken) {
        return {
          success: false,
          message: 'Refresh token is required',
        };
      }

      const { data, error } = await authClient.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        return {
          success: false,
          message: error?.message ?? 'Unable to refresh session',
        };
      }

      const expiresAt = data.session.expires_at
        ? new Date(data.session.expires_at * 1000).toISOString()
        : null;

      return {
        success: true,
        message: 'Session refreshed successfully',
        data: {
          user: data.user,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresIn: data.session.expires_in,
          expiresAt,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  /**
   * Verifies current password via sign-in, then updates to the new password.
   * Uses a dedicated anon client so the shared authClient session is unchanged.
   */
  async changePassword(
    userId: string,
    email: string | undefined,
    oldPassword: string,
    newPassword: string,
  ): Promise<any> {
    try {
      const oldStr =
        typeof oldPassword === 'string' ? oldPassword : String(oldPassword ?? '');
      const newStr =
        typeof newPassword === 'string' ? newPassword : String(newPassword ?? '');

      if (!oldStr) {
        return {
          success: false,
          message: 'Current password is required',
        };
      }
      if (!newStr) {
        return {
          success: false,
          message: 'New password is required',
        };
      }
      if (newStr.length < 6) {
        return {
          success: false,
          message: 'New password must be at least 6 characters',
        };
      }
      if (oldStr === newStr) {
        return {
          success: false,
          message: 'New password must be different from current password',
        };
      }

      const emailTrimmed =
        typeof email === 'string' ? email.trim() : String(email ?? '').trim();
      if (!emailTrimmed || !this.isValidEmail(emailTrimmed)) {
        return {
          success: false,
          message: 'No email on account; password change is not available',
        };
      }

      const client = createEphemeralAnonClient();
      const { data: signInData, error: signInError } =
        await client.auth.signInWithPassword({
          email: emailTrimmed,
          password: oldStr,
        });

      if (signInError) {
        return {
          success: false,
          message: this.mapSignInAuthErrorMessage(signInError),
        };
      }

      if (signInData.user?.id !== userId) {
        return {
          success: false,
          message: 'Invalid session',
        };
      }

      const { error: updateError } = await client.auth.updateUser({
        password: newStr,
      });

      if (updateError) {
        return {
          success: false,
          message: updateError.message || 'Unable to update password',
        };
      }

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async logoutUser(sessionToken: string, refreshToken: string): Promise<any> {
    try {
      if (!sessionToken || !refreshToken) {
        return {
          success: false,
          message: 'Session token and refresh token are required',
        };
      }

      const { error: setSessionError } = await authClient.auth.setSession({
        access_token: sessionToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        return {
          success: false,
          message: setSessionError.message,
        };
      }

      const { error } = await authClient.auth.signOut({ scope: 'local' });

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'User logged out successfully',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  async deleteUser(userId: string) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        return {
          success: false,
          message: error.message,
        };
      }

      return {
        success: true,
        message: 'User deleted successfully',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Server error',
      };
    }
  }

  private isValidEmail(email: string | undefined): boolean {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /** Non-empty string with a plausible phone length (digits only, 7–15). */
  private isValidPhone(phone: string | undefined): boolean {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  /** User-facing copy for Supabase Auth errors from signInWithPassword. */
  private mapSignInAuthErrorMessage(error: {
    message?: string;
    code?: string;
    status?: number;
  }): string {
    const raw = (error.message || '').trim();
    const lower = raw.toLowerCase();
    const code = String(error.code || '').toLowerCase();

    if (
      code === 'invalid_credentials' ||
      code === 'invalid_grant' ||
      lower.includes('invalid login credentials') ||
      lower.includes('invalid email or password')
    ) {
      return 'Invalid email or password';
    }

    if (lower.includes('email not confirmed')) {
      return 'Please confirm your email address before signing in';
    }

    if (raw) {
      return raw;
    }

    return 'Invalid email or password';
  }
}
