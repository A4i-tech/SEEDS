import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { deleteTeacher, getTeachers, registerTeacher, transferTeacher, updateTeacher } from '../../../../../src/features/registration/api/teachers';

vi.mock('@shared/services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);

const teacher = (overrides = {}) => ({
  id: 'te1',
  role: 'teacher',
  name: 'N',
  email: '',
  phone_number: '1',
  tenant_id: 't1',
  school_id: 's1',
  tenant_name: '',
  is_active: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('teachers api (teacherService port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateTeacher PATCHes the trimmed body', async () => {
    mockedPatch.mockResolvedValue({ data: teacher({ name: 'Updated', phone_number: '918888888882' }) });
    const result = await updateTeacher('teacher-1', {
      name: 'Updated',
      phone_number: '918888888882',
      password: '',
    });
    expect(mockedPatch).toHaveBeenCalledWith('/teacher/teacher-1', {
      name: 'Updated',
      phone_number: '918888888882',
      password: '',
    });
    expect(result.name).toBe('Updated');
    expect(result.phone_number).toBe('918888888882');
  });

  it('updateTeacher includes password when present', async () => {
    mockedPatch.mockResolvedValue({ data: teacher() });
    await updateTeacher('te1', { name: 'N', phone_number: '1', password: 'secret' });
    expect(mockedPatch.mock.calls[0][1]).toMatchObject({ password: 'secret' });
  });

  it('getTeachers returns the school teacher list', async () => {
    mockedGet.mockResolvedValue({ data: [{ id: 'te1', name: 'N', phone_number: '911111111111', role: 'teacher' }] });
    const result = await getTeachers();
    expect(mockedGet).toHaveBeenCalledWith('/school/teachers');
    expect(result[0].id).toBe('te1');
    expect(result[0].phone_number).toBe('911111111111');
  });

  it('registerTeacher POSTs the register body', async () => {
    mockedPost.mockResolvedValue({ data: teacher() });
    const result = await registerTeacher({ phone_number: '1', password: 'p', name: 'N', role: 'teacher' });
    expect(mockedPost).toHaveBeenCalledWith('/teacher/register', {
      phone_number: '1',
      password: 'p',
      name: 'N',
      role: 'teacher',
    });
    expect(result.id).toBe('te1');
  });

  it('deleteTeacher calls DELETE', async () => {
    mockedDelete.mockResolvedValue({ data: undefined });
    await deleteTeacher('te1');
    expect(mockedDelete).toHaveBeenCalledWith('/teacher/te1');
  });

  it('transferTeacher POSTs teacher_id/target_school_id', async () => {
    mockedPost.mockResolvedValue({ data: { message: 'ok', teacher: teacher() } });
    const result = await transferTeacher({ teacher_id: 'te1', target_school_id: 's2' });
    expect(mockedPost).toHaveBeenCalledWith('/school/transfer', { teacher_id: 'te1', target_school_id: 's2' });
    expect(result.teacher.id).toBe('te1');
  });
});
