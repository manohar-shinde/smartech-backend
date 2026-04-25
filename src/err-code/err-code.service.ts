import { Injectable } from '@nestjs/common';
import { CreateErrCodeDto } from './dto/create-err-code.dto';
import { UpdateErrCodeDto } from './dto/update-err-code.dto';
import { supabase } from 'src/supabase/supabase.client';

@Injectable()
export class ErrCodeService {
  async create(createErrCodeDto: CreateErrCodeDto): Promise<any> {
    try {
      // Insert into err_codes table
      const { data: errCodeData, error: errCodeError } = await supabase
        .from('err_codes')
        .insert([
          {
            err_code: createErrCodeDto.errCode,
            title_english: createErrCodeDto.titleEnglish,
            title_hindi: createErrCodeDto.titleHindi || null,
          },
        ])
        .select();

      if (errCodeError) {
        throw new Error(`Error creating err_code: ${errCodeError.message}`);
      }

      const errCodeId = errCodeData[0].id;

      // Prepare steps data
      const stepsData = createErrCodeDto.steps.map((step, index) => ({
        err_code_id: errCodeId,
        step_order: index + 1,
        step_text: step,
      }));

      // Insert into err_code_steps table
      const { data: stepsDataInserted, error: stepsError } = await supabase
        .from('err_code_steps')
        .insert(stepsData)
        .select();

      if (stepsError) {
        // Rollback: Delete the inserted err_code if steps insertion fails
        await supabase.from('err_codes').delete().eq('id', errCodeId);
        throw new Error(`Error creating steps: ${stepsError.message}`);
      }

      return {
        success: true,
        message: 'Error code created successfully',
        data: {
          errCode: errCodeData[0],
          steps: stepsDataInserted,
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          message: 'Error creating error code',
          error: error.message,
        };
      }
      return {
        success: false,
        message: 'Error creating error code',
      };
    }
  }

  async findByErrCode(searchQuery: string): Promise<any> {
    try {
      if (!searchQuery?.trim()) {
        return {
          success: false,
          message: 'searchQuery is required',
        };
      }

      // Normalize search query to handle different formats
      // Remove "err" prefix if present and pad with leading zero if needed
      let normalizedQuery = searchQuery.trim().toLowerCase();

      if (normalizedQuery.startsWith('err')) {
        normalizedQuery = normalizedQuery.substring(3);
      }

      // Pad with leading zero if it's a single digit (1 -> 01, 01 -> 01)
      if (normalizedQuery.length === 1) {
        normalizedQuery = '0' + normalizedQuery;
      }

      // Create the final err_code format (err01, err02, etc.)
      const finalErrCode = 'err' + normalizedQuery;

      // Fetch err_code with associated steps
      const { data: errCodeData, error: errCodeError } = await supabase
        .from('err_codes')
        .select('*')
        .eq('err_code', finalErrCode)
        .single();

      if (errCodeError) {
        if (errCodeError.code === 'PGRST116') {
          return {
            success: false,
            message: 'Error code not found',
            data: null,
          };
        }
        throw new Error(errCodeError.message);
      }

      // Fetch associated steps
      const { data: stepsData, error: stepsError } = await supabase
        .from('err_code_steps')
        .select('*')
        .eq('err_code_id', errCodeData.id)
        .order('step_order', { ascending: true });

      if (stepsError) {
        throw new Error(`Error fetching steps: ${stepsError.message}`);
      }

      return {
        success: true,
        message: 'Error code found',
        data: {
          ...errCodeData,
          steps: stepsData.map((step) => ({
            order: step.step_order,
            text: step.step_text,
          })),
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error fetching error code',
      };
    }
  }
  async update(id: number, updateErrCodeDto: UpdateErrCodeDto): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('err_codes')
        .update({
          err_code: updateErrCodeDto.errCode,
          title_english: updateErrCodeDto.titleEnglish,
          title_hindi: updateErrCodeDto.titleHindi || null,
        })
        .eq('id', id)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      return {
        success: true,
        message: 'Error code updated successfully',
        data: data[0],
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          message: 'Error updating error code',
          error: error.message,
        };
      }
      return {
        success: false,
        message: 'Error updating error code',
      };
    }
  }

  async remove(id: number): Promise<any> {
    try {
      const { error } = await supabase.from('err_codes').delete().eq('id', id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        success: true,
        message: 'Error code deleted successfully',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          message: 'Error deleting error code',
          error: error.message,
        };
      }
      return {
        success: false,
        message: 'Error deleting error code',
      };
    }
  }
}
