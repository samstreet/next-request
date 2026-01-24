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

  describe('transforms', () => {
    it('should apply transforms on valid data', async () => {
      const transformSchema = z.object({
        email: z.string().email().transform(s => s.toLowerCase()),
        age: z.string().transform(s => parseInt(s, 10)),
      });

      const adapter = new ZodAdapter(transformSchema);
      const result = await adapter.validate({
        email: 'TEST@EXAMPLE.COM',
        age: '25',
      });

      expect(result.success).toBe(true);
      expect(result.data?.email).toBe('test@example.com');
      expect(result.data?.age).toBe(25);
    });

    it('should fail when transform input is invalid', async () => {
      const transformSchema = z.object({
        value: z.number().transform(n => n * 2),
      });

      const adapter = new ZodAdapter(transformSchema);
      const result = await adapter.validate({
        value: 'not a number',
      });

      expect(result.success).toBe(false);
      expect(result.errors!.value).toBeDefined();
    });
  });

  describe('default values', () => {
    it('should apply default when field is missing', async () => {
      const defaultSchema = z.object({
        name: z.string(),
        role: z.string().default('user'),
        active: z.boolean().default(true),
      });

      const adapter = new ZodAdapter(defaultSchema);
      const result = await adapter.validate({
        name: 'John',
      });

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('user');
      expect(result.data?.active).toBe(true);
    });

    it('should not apply default when field is provided', async () => {
      const defaultSchema = z.object({
        role: z.string().default('user'),
      });

      const adapter = new ZodAdapter(defaultSchema);
      const result = await adapter.validate({
        role: 'admin',
      });

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('admin');
    });

    it('should apply default for undefined but not null', async () => {
      const defaultSchema = z.object({
        value: z.string().nullable().default('default'),
      });

      const adapter = new ZodAdapter(defaultSchema);

      const result1 = await adapter.validate({});
      expect(result1.data?.value).toBe('default');

      const result2 = await adapter.validate({ value: null });
      expect(result2.data?.value).toBeNull();
    });
  });

  describe('coercion', () => {
    it('should coerce string to number', async () => {
      const coerceSchema = z.object({
        count: z.coerce.number(),
        price: z.coerce.number(),
      });

      const adapter = new ZodAdapter(coerceSchema);
      const result = await adapter.validate({
        count: '42',
        price: '19.99',
      });

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(42);
      expect(result.data?.price).toBe(19.99);
    });

    it('should coerce to boolean', async () => {
      const coerceSchema = z.object({
        active: z.coerce.boolean(),
      });

      const adapter = new ZodAdapter(coerceSchema);

      const result1 = await adapter.validate({ active: 'true' });
      expect(result1.data?.active).toBe(true);

      const result2 = await adapter.validate({ active: '' });
      expect(result2.data?.active).toBe(false);

      const result3 = await adapter.validate({ active: 1 });
      expect(result3.data?.active).toBe(true);
    });

    it('should coerce to date', async () => {
      const coerceSchema = z.object({
        createdAt: z.coerce.date(),
      });

      const adapter = new ZodAdapter(coerceSchema);
      const result = await adapter.validate({
        createdAt: '2024-01-15T10:30:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.data?.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('discriminated unions', () => {
    it('should validate discriminated union - type A', async () => {
      const discriminatedSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('email'), email: z.string().email() }),
        z.object({ type: z.literal('phone'), phone: z.string().min(10) }),
      ]);

      const adapter = new ZodAdapter(discriminatedSchema);
      const result = await adapter.validate({
        type: 'email',
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('email');
    });

    it('should validate discriminated union - type B', async () => {
      const discriminatedSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('email'), email: z.string().email() }),
        z.object({ type: z.literal('phone'), phone: z.string().min(10) }),
      ]);

      const adapter = new ZodAdapter(discriminatedSchema);
      const result = await adapter.validate({
        type: 'phone',
        phone: '1234567890',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('phone');
    });

    it('should fail for invalid discriminated union', async () => {
      const discriminatedSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('email'), email: z.string().email() }),
        z.object({ type: z.literal('phone'), phone: z.string().min(10) }),
      ]);

      const adapter = new ZodAdapter(discriminatedSchema);
      const result = await adapter.validate({
        type: 'email',
        email: 'invalid-email',
      });

      expect(result.success).toBe(false);
      expect(result.errors!.email).toBeDefined();
    });

    it('should fail for unknown discriminator value', async () => {
      const discriminatedSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('email'), email: z.string().email() }),
        z.object({ type: z.literal('phone'), phone: z.string().min(10) }),
      ]);

      const adapter = new ZodAdapter(discriminatedSchema);
      const result = await adapter.validate({
        type: 'unknown',
        value: 'test',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable fields', async () => {
      const nullableSchema = z.object({
        name: z.string().nullable(),
        bio: z.string().nullable(),
      });

      const adapter = new ZodAdapter(nullableSchema);

      const result1 = await adapter.validate({ name: 'John', bio: null });
      expect(result1.success).toBe(true);
      expect(result1.data?.bio).toBeNull();

      const result2 = await adapter.validate({ name: null, bio: 'Hello' });
      expect(result2.success).toBe(true);
      expect(result2.data?.name).toBeNull();
    });

    it('should handle optional fields', async () => {
      const optionalSchema = z.object({
        name: z.string(),
        nickname: z.string().optional(),
      });

      const adapter = new ZodAdapter(optionalSchema);

      const result = await adapter.validate({ name: 'John' });
      expect(result.success).toBe(true);
      expect(result.data?.nickname).toBeUndefined();
    });

    it('should handle nullish (nullable + optional)', async () => {
      const nullishSchema = z.object({
        value: z.string().nullish(),
      });

      const adapter = new ZodAdapter(nullishSchema);

      const result1 = await adapter.validate({});
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({ value: null });
      expect(result2.success).toBe(true);

      const result3 = await adapter.validate({ value: 'test' });
      expect(result3.success).toBe(true);
    });
  });

  describe('deeply nested objects', () => {
    it('should handle 3-level nesting', async () => {
      const deepSchema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              value: z.string().min(1),
            }),
          }),
        }),
      });

      const adapter = new ZodAdapter(deepSchema);
      const result = await adapter.validate({
        level1: {
          level2: {
            level3: {
              value: '',
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.errors!['level1.level2.level3.value']).toBeDefined();
    });

    it('should validate deeply nested valid data', async () => {
      const deepSchema = z.object({
        company: z.object({
          department: z.object({
            team: z.object({
              name: z.string(),
              members: z.array(z.object({
                name: z.string(),
                role: z.string(),
              })),
            }),
          }),
        }),
      });

      const adapter = new ZodAdapter(deepSchema);
      const result = await adapter.validate({
        company: {
          department: {
            team: {
              name: 'Engineering',
              members: [
                { name: 'Alice', role: 'Lead' },
                { name: 'Bob', role: 'Developer' },
              ],
            },
          },
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('arrays with objects', () => {
    it('should report errors for multiple array items', async () => {
      const arraySchema = z.object({
        users: z.array(z.object({
          email: z.string().email(),
        })),
      });

      const adapter = new ZodAdapter(arraySchema);
      const result = await adapter.validate({
        users: [
          { email: 'valid@example.com' },
          { email: 'invalid1' },
          { email: 'valid2@example.com' },
          { email: 'invalid2' },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors!['users.1.email']).toBeDefined();
      expect(result.errors!['users.3.email']).toBeDefined();
      expect(result.errors!['users.0.email']).toBeUndefined();
    });

    it('should handle empty arrays', async () => {
      const arraySchema = z.object({
        items: z.array(z.string()),
      });

      const adapter = new ZodAdapter(arraySchema);
      const result = await adapter.validate({ items: [] });

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
    });

    it('should validate array length constraints', async () => {
      const arraySchema = z.object({
        tags: z.array(z.string()).min(1).max(5),
      });

      const adapter = new ZodAdapter(arraySchema);

      const result1 = await adapter.validate({ tags: [] });
      expect(result1.success).toBe(false);

      const result2 = await adapter.validate({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
      expect(result2.success).toBe(false);

      const result3 = await adapter.validate({ tags: ['a', 'b', 'c'] });
      expect(result3.success).toBe(true);
    });
  });

  describe('enum types', () => {
    it('should validate native enum', async () => {
      enum Status {
        Active = 'active',
        Inactive = 'inactive',
        Pending = 'pending',
      }

      const enumSchema = z.object({
        status: z.nativeEnum(Status),
      });

      const adapter = new ZodAdapter(enumSchema);

      const result1 = await adapter.validate({ status: 'active' });
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({ status: 'invalid' });
      expect(result2.success).toBe(false);
    });

    it('should validate Zod enum', async () => {
      const zodEnumSchema = z.object({
        priority: z.enum(['low', 'medium', 'high']),
      });

      const adapter = new ZodAdapter(zodEnumSchema);

      const result1 = await adapter.validate({ priority: 'high' });
      expect(result1.success).toBe(true);
      expect(result1.data?.priority).toBe('high');

      const result2 = await adapter.validate({ priority: 'critical' });
      expect(result2.success).toBe(false);
    });
  });

  describe('record types', () => {
    it('should validate record with string keys', async () => {
      const recordSchema = z.object({
        metadata: z.record(z.string(), z.number()),
      });

      const adapter = new ZodAdapter(recordSchema);
      const result = await adapter.validate({
        metadata: {
          views: 100,
          likes: 50,
          shares: 25,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.metadata.views).toBe(100);
    });

    it('should fail for invalid record values', async () => {
      const recordSchema = z.object({
        scores: z.record(z.string(), z.number().min(0).max(100)),
      });

      const adapter = new ZodAdapter(recordSchema);
      const result = await adapter.validate({
        scores: {
          math: 95,
          science: 150, // Invalid: > 100
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('tuple types', () => {
    it('should validate tuple', async () => {
      const tupleSchema = z.object({
        coordinates: z.tuple([z.number(), z.number()]),
      });

      const adapter = new ZodAdapter(tupleSchema);

      const result1 = await adapter.validate({ coordinates: [10, 20] });
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({ coordinates: [10] });
      expect(result2.success).toBe(false);

      const result3 = await adapter.validate({ coordinates: [10, 20, 30] });
      expect(result3.success).toBe(false);
    });

    it('should validate mixed tuple', async () => {
      const mixedTupleSchema = z.object({
        data: z.tuple([z.string(), z.number(), z.boolean()]),
      });

      const adapter = new ZodAdapter(mixedTupleSchema);
      const result = await adapter.validate({
        data: ['hello', 42, true],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('intersection types', () => {
    it('should validate intersection', async () => {
      const baseSchema = z.object({ id: z.string() });
      const extendSchema = z.object({ name: z.string() });
      const intersectionSchema = z.intersection(baseSchema, extendSchema);

      const adapter = new ZodAdapter(intersectionSchema);
      const result = await adapter.validate({ id: '123', name: 'Test' });

      expect(result.success).toBe(true);
    });

    it('should fail when intersection part is invalid', async () => {
      const baseSchema = z.object({ id: z.string() });
      const extendSchema = z.object({ name: z.string() });
      const intersectionSchema = z.intersection(baseSchema, extendSchema);

      const adapter = new ZodAdapter(intersectionSchema);
      const result = await adapter.validate({ id: '123' });

      expect(result.success).toBe(false);
    });
  });

  describe('passthrough and strict', () => {
    it('should strip unknown keys by default', async () => {
      const strictSchema = z.object({
        name: z.string(),
      });

      const adapter = new ZodAdapter(strictSchema);
      const result = await adapter.validate({
        name: 'John',
        extra: 'field',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John' });
      expect((result.data as any).extra).toBeUndefined();
    });

    it('should passthrough unknown keys when specified', async () => {
      const passthroughSchema = z.object({
        name: z.string(),
      }).passthrough();

      const adapter = new ZodAdapter(passthroughSchema);
      const result = await adapter.validate({
        name: 'John',
        extra: 'field',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).extra).toBe('field');
    });

    it('should error on unknown keys when strict', async () => {
      const strictSchema = z.object({
        name: z.string(),
      }).strict();

      const adapter = new ZodAdapter(strictSchema);
      const result = await adapter.validate({
        name: 'John',
        extra: 'field',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('preprocess', () => {
    it('should preprocess data before validation', async () => {
      const preprocessSchema = z.object({
        value: z.preprocess(
          (val) => (typeof val === 'string' ? val.trim() : val),
          z.string().min(1)
        ),
      });

      const adapter = new ZodAdapter(preprocessSchema);

      const result1 = await adapter.validate({ value: '  hello  ' });
      expect(result1.success).toBe(true);
      expect(result1.data?.value).toBe('hello');

      const result2 = await adapter.validate({ value: '   ' });
      expect(result2.success).toBe(false);
    });
  });

  describe('superRefine', () => {
    it('should handle superRefine validations', async () => {
      const superRefineSchema = z.object({
        password: z.string(),
        confirmPassword: z.string(),
      }).superRefine((data, ctx) => {
        if (data.password !== data.confirmPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Passwords must match',
            path: ['confirmPassword'],
          });
        }
        if (data.password.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Password must be at least 8 characters',
            path: ['password'],
          });
        }
      });

      const adapter = new ZodAdapter(superRefineSchema);

      const result1 = await adapter.validate({
        password: 'short',
        confirmPassword: 'short',
      });
      expect(result1.success).toBe(false);
      expect(result1.errors!.password).toBeDefined();

      const result2 = await adapter.validate({
        password: 'longpassword',
        confirmPassword: 'different',
      });
      expect(result2.success).toBe(false);
      expect(result2.errors!.confirmPassword).toBeDefined();
    });
  });

  describe('custom attribute names', () => {
    it('should use custom attribute names in error messages', async () => {
      const adapter = new ZodAdapter(schema);
      const result = await adapter.validate(
        { email: 'invalid', name: 'J' },
        {
          attributes: {
            email: 'email address',
            name: 'full name',
          },
        }
      );

      expect(result.success).toBe(false);
      // The attribute replacement happens in error messages
      expect(result.errors).toBeDefined();
    });

    it('should handle nested field attributes', async () => {
      const nestedSchema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      const adapter = new ZodAdapter(nestedSchema);
      const result = await adapter.validate(
        { user: { email: 'invalid' } },
        {
          attributes: {
            'user.email': 'user email address',
          },
        }
      );

      expect(result.success).toBe(false);
      expect(result.errors!['user.email']).toBeDefined();
    });
  });

  describe('multiple validation rules', () => {
    it('should collect multiple errors for same field', async () => {
      const multiRuleSchema = z.object({
        password: z.string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain uppercase')
          .regex(/[0-9]/, 'Password must contain a number'),
      });

      const adapter = new ZodAdapter(multiRuleSchema);
      const result = await adapter.validate({
        password: 'abc', // Fails all three rules
      });

      expect(result.success).toBe(false);
      expect(result.errors!.password.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('literal types', () => {
    it('should validate literal string', async () => {
      const literalSchema = z.object({
        type: z.literal('user'),
      });

      const adapter = new ZodAdapter(literalSchema);

      const result1 = await adapter.validate({ type: 'user' });
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({ type: 'admin' });
      expect(result2.success).toBe(false);
    });

    it('should validate literal number', async () => {
      const literalSchema = z.object({
        version: z.literal(1),
      });

      const adapter = new ZodAdapter(literalSchema);

      const result1 = await adapter.validate({ version: 1 });
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({ version: 2 });
      expect(result2.success).toBe(false);
    });
  });

  describe('date validation', () => {
    it('should validate Date objects', async () => {
      const dateSchema = z.object({
        createdAt: z.date(),
      });

      const adapter = new ZodAdapter(dateSchema);
      const result = await adapter.validate({
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
    });

    it('should fail for invalid dates', async () => {
      const dateSchema = z.object({
        createdAt: z.date(),
      });

      const adapter = new ZodAdapter(dateSchema);
      const result = await adapter.validate({
        createdAt: 'not a date',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('brand types', () => {
    it('should validate branded types', async () => {
      const brandedSchema = z.object({
        userId: z.string().uuid().brand<'UserId'>(),
      });

      const adapter = new ZodAdapter(brandedSchema);

      const result1 = await adapter.validate({
        userId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result1.success).toBe(true);

      const result2 = await adapter.validate({
        userId: 'not-a-uuid',
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('catch for defaults', () => {
    it('should use catch value for invalid data', async () => {
      const catchSchema = z.object({
        count: z.number().catch(0),
      });

      const adapter = new ZodAdapter(catchSchema);
      const result = await adapter.validate({
        count: 'invalid',
      });

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(0);
    });
  });

  describe('pipe for transformations', () => {
    it('should pipe schemas together', async () => {
      const pipeSchema = z.object({
        value: z.string().transform(s => parseInt(s)).pipe(z.number().min(0)),
      });

      const adapter = new ZodAdapter(pipeSchema);

      const result1 = await adapter.validate({ value: '42' });
      expect(result1.success).toBe(true);
      expect(result1.data?.value).toBe(42);

      const result2 = await adapter.validate({ value: '-5' });
      expect(result2.success).toBe(false);
    });
  });
});
