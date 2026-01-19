import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ZodAdapter } from '../src/adapters/validators/ZodAdapter';

describe('ZodAdapter', () => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    age: z.number().min(18).optional(),
  });

  it('should validate valid data', async () => {
    const adapter = new ZodAdapter(schema);
    const result = await adapter.validate({
      email: 'test@example.com',
      name: 'John',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: 'test@example.com',
      name: 'John',
    });
    expect(result.errors).toBeUndefined();
  });

  it('should validate data synchronously', () => {
    const adapter = new ZodAdapter(schema);
    const result = adapter.validateSync({
      email: 'test@example.com',
      name: 'John',
      age: 25,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: 'test@example.com',
      name: 'John',
      age: 25,
    });
  });

  it('should return errors for invalid data', async () => {
    const adapter = new ZodAdapter(schema);
    const result = await adapter.validate({
      email: 'invalid-email',
      name: 'J',
    });

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors!.email).toBeDefined();
    expect(result.errors!.name).toBeDefined();
  });

  it('should return errors for missing required fields', async () => {
    const adapter = new ZodAdapter(schema);
    const result = await adapter.validate({});

    expect(result.success).toBe(false);
    expect(result.errors!.email).toBeDefined();
    expect(result.errors!.name).toBeDefined();
  });

  it('should use custom messages', async () => {
    const adapter = new ZodAdapter(schema);
    const result = await adapter.validate(
      { email: 'invalid', name: 'J' },
      {
        messages: {
          'email.invalid_string': 'Please enter a valid email address',
          'name': 'Name is too short',
        },
      }
    );

    expect(result.success).toBe(false);
    expect(result.errors!.email).toContain('Please enter a valid email address');
    expect(result.errors!.name).toContain('Name is too short');
  });

  it('should handle nested objects', async () => {
    const nestedSchema = z.object({
      user: z.object({
        email: z.string().email(),
        profile: z.object({
          name: z.string().min(2),
        }),
      }),
    });

    const adapter = new ZodAdapter(nestedSchema);
    const result = await adapter.validate({
      user: {
        email: 'invalid',
        profile: {
          name: 'A',
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors!['user.email']).toBeDefined();
    expect(result.errors!['user.profile.name']).toBeDefined();
  });

  it('should handle arrays', async () => {
    const arraySchema = z.object({
      tags: z.array(z.string().min(2)),
    });

    const adapter = new ZodAdapter(arraySchema);
    const result = await adapter.validate({
      tags: ['valid', 'a', 'also-valid'],
    });

    expect(result.success).toBe(false);
    expect(result.errors!['tags.1']).toBeDefined();
  });

  it('should handle union types', async () => {
    const unionSchema = z.object({
      value: z.union([z.string(), z.number()]),
    });

    const adapter = new ZodAdapter(unionSchema);

    const validString = await adapter.validate({ value: 'hello' });
    expect(validString.success).toBe(true);

    const validNumber = await adapter.validate({ value: 42 });
    expect(validNumber.success).toBe(true);

    const invalid = await adapter.validate({ value: true });
    expect(invalid.success).toBe(false);
  });

  it('should handle custom Zod error messages', async () => {
    const customSchema = z.object({
      email: z.string().email({ message: 'Custom email error' }),
    });

    const adapter = new ZodAdapter(customSchema);
    const result = await adapter.validate({ email: 'invalid' });

    expect(result.success).toBe(false);
    expect(result.errors!.email).toContain('Custom email error');
  });

  it('should handle refinements', async () => {
    const refinedSchema = z.object({
      password: z.string().min(8),
      confirmPassword: z.string(),
    }).refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    });

    const adapter = new ZodAdapter(refinedSchema);
    const result = await adapter.validate({
      password: 'password123',
      confirmPassword: 'different',
    });

    expect(result.success).toBe(false);
    expect(result.errors!.confirmPassword).toContain('Passwords do not match');
  });
});
