import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { authClient, supabase } from '../supabase/supabase.client';
import { CreateUserDto } from './create-user.dto';

@Injectable()
export class UserService {
  constructor() {}
  // Create a new user in the Supabase 'users' table
  async createUser(createUserDto: CreateUserDto): Promise<any> {
    try {
      if (!this.isValidEmail(createUserDto.email)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }
      // 1️⃣ Create user in Supabase Auth
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: createUserDto.email,
          password: createUserDto.password,
          phone: createUserDto.phone,
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
            name: createUserDto.name,
            email: createUserDto.email,
            phone: createUserDto.phone,
            address: createUserDto.address,
            role: createUserDto.role,
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

  // Login
  async loginUser(email: string, password: string): Promise<any> {
    try {
      if (!this.isValidEmail(email)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          message: error.message,
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

      const { data: publicUser, error: publicUserError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();

      if (publicUserError) {
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
}
