import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@shared/services/apiClient';
import { createStudent, deleteStudent, getStudents, updateStudent } from '../../../../src/features/registration/api/students';

vi.mock('@shared/services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);

describe('students api (teacherService port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createStudent POSTs name/phone_number to /student', async () => {
    mockedPost.mockResolvedValue({ data: { id: 's1', name: 'A', phone_number: '911111111111' } });
    const result = await createStudent({ name: 'A', phone_number: '911111111111' });
    expect(mockedPost).toHaveBeenCalledWith('/student', { name: 'A', phone_number: '911111111111' });
    expect(result.id).toBe('s1');
    expect(result.phone_number).toBe('911111111111');
  });

  it('returns created student on success', async () => {
    mockedPost.mockResolvedValue({ data: { id: 's2', name: 'New', phone_number: '912222222222' } });
    const result = await createStudent({ name: 'New', phone_number: '912222222222' });
    expect(result.id).toBe('s2');
    expect(result.phone_number).toBe('912222222222');
  });

  it('updateStudent PATCHes /student/:id', async () => {
    mockedPatch.mockResolvedValue({ data: { id: '918888888881', name: 'Updated', phone_number: '918888888882' } });
    const result = await updateStudent('918888888881', { name: 'Updated', phone_number: '918888888882' });
    expect(mockedPatch).toHaveBeenCalledTimes(1);
    expect(mockedPatch).toHaveBeenCalledWith('/student/918888888881', {
      name: 'Updated',
      phone_number: '918888888882',
    });
    expect(result.name).toBe('Updated');
  });

  it('propagates errors from updateStudent', async () => {
    mockedPatch.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    await expect(updateStudent('916666666666', { name: 'Name', phone_number: '917777777777' })).rejects.toMatchObject({
      status: 409,
      message: 'Conflict',
    });
  });

  it('getStudents returns the student list', async () => {
    mockedGet.mockResolvedValue({ data: [{ id: 'st1', name: 'S', phone_number: '922222222222' }] });
    const result = await getStudents();
    expect(mockedGet).toHaveBeenCalledWith('/student');
    expect(result[0].id).toBe('st1');
    expect(result[0].phone_number).toBe('922222222222');
  });

  it('deleteStudent calls DELETE', async () => {
    mockedDelete.mockResolvedValue({ data: undefined });
    await deleteStudent('st1');
    expect(mockedDelete).toHaveBeenCalledWith('/student/st1');
  });
});
