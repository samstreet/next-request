import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ZodAdapter } from '../src/adapters/validators/ZodAdapter';
import { ValidationError } from '../src/core/errors';
import { withSchema, withApiSchema } from '../src/middleware/withSchema';

// Test schema
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

type UserData = z.infer<typeof userSchema>;

// Helper to create mock Request
function createMockRequest(body: unknown, options?: RequestInit): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...options,
  });
}

// Helper to create mock NextApiRequest
function createMockNextApiRequest(body: unknown): any {
  return {
    method: 'POST',
    body,
    query: {},
    headers: { 'content-type': 'application/json' },
  };
}

// Helper to create mock NextApiResponse
function createMockNextApiResponse(): any {
  const res: any = {
    statusCode: 200,
    _json: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this._json = data;
      return this;
    },
  };
  return res;
}

describe('withSchema (App Router)', () => {
  it('should pass validated data to handler', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockImplementation((data: UserData) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      request
    );
    expect(response).toBeInstanceOf(Response);
  });

  it('should throw ValidationError for invalid data', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockReturnValue(Response.json({}));

    const wrappedHandler = withSchema(adapter, handler);
    const request = createMockRequest({ email: 'invalid', name: 'J' });

    await expect(wrappedHandler(request)).rejects.toThrow(ValidationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should properly infer types from adapter', async () => {
    const adapter = new ZodAdapter(userSchema);

    // This test verifies type inference by using the handler
    const wrappedHandler = withSchema(adapter, async (data) => {
      // TypeScript should infer data as UserData
      const email: string = data.email;
      const name: string = data.name;
      return Response.json({ email, name });
    });

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body).toEqual({ email: 'test@example.com', name: 'John' });
  });

  it('should handle empty request body', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockReturnValue(Response.json({}));

    const wrappedHandler = withSchema(adapter, handler);
    const request = createMockRequest({});

    await expect(wrappedHandler(request)).rejects.toThrow(ValidationError);
  });

  it('should provide access to original request in handler', async () => {
    const adapter = new ZodAdapter(userSchema);
    let capturedRequest: Request | null = null;

    const handler = vi.fn().mockImplementation((data, req) => {
      capturedRequest = req;
      return Response.json({ success: true });
    });

    const wrappedHandler = withSchema(adapter, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    await wrappedHandler(request);

    expect(capturedRequest).toBe(request);
  });

  it('should handle form data content type', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockImplementation((data: UserData) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const formData = new FormData();
    formData.append('email', 'test@example.com');
    formData.append('name', 'John');

    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      body: formData,
    });

    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      request
    );
    expect(response).toBeInstanceOf(Response);
  });

  it('should handle url-encoded content type', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockImplementation((data: UserData) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const params = new URLSearchParams();
    params.append('email', 'test@example.com');
    params.append('name', 'John');

    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      request
    );
  });

  it('should handle malformed JSON gracefully', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockReturnValue(Response.json({}));

    const wrappedHandler = withSchema(adapter, handler);

    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid json {',
    });

    // Should treat as empty object and fail validation
    await expect(wrappedHandler(request)).rejects.toThrow(ValidationError);
  });

  it('should handle custom response types from handler', async () => {
    const adapter = new ZodAdapter(userSchema);

    const wrappedHandler = withSchema(adapter, async (data) => {
      return new Response('Custom response', {
        status: 201,
        headers: { 'X-Custom': 'header' },
      });
    });

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(201);
    expect(response.headers.get('X-Custom')).toBe('header');
  });

  it('should propagate handler errors', async () => {
    const adapter = new ZodAdapter(userSchema);

    const wrappedHandler = withSchema(adapter, async (data) => {
      throw new Error('Handler error');
    });

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    await expect(wrappedHandler(request)).rejects.toThrow('Handler error');
  });
});

describe('withApiSchema (Pages Router)', () => {
  it('should pass validated data to handler', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn();

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      req,
      res
    );
  });

  it('should throw ValidationError for invalid data', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn();

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
    const res = createMockNextApiResponse();

    await expect(wrappedHandler(req, res)).rejects.toThrow(ValidationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should properly infer types from adapter', async () => {
    const adapter = new ZodAdapter(userSchema);

    // This test verifies type inference by using the handler
    const wrappedHandler = withApiSchema(adapter, async (data, req, res) => {
      // TypeScript should infer data as UserData
      const email: string = data.email;
      const name: string = data.name;
      res.status(200).json({ email, name });
    });

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(res._json).toEqual({ email: 'test@example.com', name: 'John' });
  });

  it('should provide access to req and res in handler', async () => {
    const adapter = new ZodAdapter(userSchema);
    let capturedReq: any = null;
    let capturedRes: any = null;

    const handler = vi.fn().mockImplementation((data, req, res) => {
      capturedReq = req;
      capturedRes = res;
      res.status(200).json({ success: true });
    });

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(capturedReq).toBe(req);
    expect(capturedRes).toBe(res);
  });

  it('should handle empty request body', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn();

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({});
    const res = createMockNextApiResponse();

    await expect(wrappedHandler(req, res)).rejects.toThrow(ValidationError);
  });

  it('should propagate handler errors', async () => {
    const adapter = new ZodAdapter(userSchema);

    const wrappedHandler = withApiSchema(adapter, async (data, req, res) => {
      throw new Error('Handler error');
    });

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await expect(wrappedHandler(req, res)).rejects.toThrow('Handler error');
  });

  it('should allow handler to set custom status and headers', async () => {
    const adapter = new ZodAdapter(userSchema);

    const res: any = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      _json: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        this._json = data;
        return this;
      },
      setHeader(name: string, value: string) {
        this._headers[name] = value;
        return this;
      },
    };

    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.setHeader('X-Custom', 'value');
      res.status(201).json({ user: data });
    });

    const wrappedHandler = withApiSchema(adapter, handler);
    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });

    await wrappedHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res._headers['X-Custom']).toBe('value');
  });
});

describe('withSchema - Advanced Scenarios', () => {
  it('should work with complex nested schemas', async () => {
    const complexSchema = z.object({
      user: z.object({
        email: z.string().email(),
        profile: z.object({
          name: z.string(),
          age: z.number().min(18),
        }),
      }),
      settings: z.object({
        notifications: z.boolean(),
        theme: z.enum(['light', 'dark']),
      }),
    });

    const adapter = new ZodAdapter(complexSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ success: true, data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const request = createMockRequest({
      user: {
        email: 'test@example.com',
        profile: {
          name: 'John Doe',
          age: 25,
        },
      },
      settings: {
        notifications: true,
        theme: 'dark',
      },
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('test@example.com');
  });

  it('should work with schema transformations', async () => {
    const transformSchema = z.object({
      email: z.string().email().transform(val => val.toLowerCase()),
      name: z.string().transform(val => val.trim()),
    });

    const adapter = new ZodAdapter(transformSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const request = createMockRequest({
      email: 'TEST@EXAMPLE.COM',
      name: '  John Doe  ',
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.user.email).toBe('test@example.com');
    expect(body.user.name).toBe('John Doe');
  });

  it('should work with optional fields', async () => {
    const optionalSchema = z.object({
      email: z.string().email(),
      name: z.string(),
      age: z.number().optional(),
      bio: z.string().optional(),
    });

    const adapter = new ZodAdapter(optionalSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const request = createMockRequest({
      email: 'test@example.com',
      name: 'John',
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.user.email).toBe('test@example.com');
    expect(body.user.age).toBeUndefined();
  });

  it('should handle array schemas', async () => {
    const arraySchema = z.object({
      users: z.array(z.object({
        email: z.string().email(),
        name: z.string(),
      })),
    });

    const adapter = new ZodAdapter(arraySchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ count: data.users.length });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const request = createMockRequest({
      users: [
        { email: 'user1@example.com', name: 'User 1' },
        { email: 'user2@example.com', name: 'User 2' },
      ],
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.count).toBe(2);
  });
});

describe('withApiSchema - Advanced Scenarios', () => {
  it('should work with complex nested schemas', async () => {
    const complexSchema = z.object({
      data: z.object({
        items: z.array(z.string()),
        metadata: z.record(z.string()),
      }),
    });

    const adapter = new ZodAdapter(complexSchema);
    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.status(200).json({ itemCount: data.data.items.length });
    });

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({
      data: {
        items: ['a', 'b', 'c'],
        metadata: { key: 'value' },
      },
    });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(res._json.itemCount).toBe(3);
  });

  it('should provide detailed validation errors', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn();

    const wrappedHandler = withApiSchema(adapter, handler);

    const req = createMockNextApiRequest({
      email: 'not-an-email',
      name: 'J',
    });
    const res = createMockNextApiResponse();

    try {
      await wrappedHandler(req, res);
      expect.fail('Should have thrown ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.errors.email).toBeDefined();
      expect(validationError.errors.name).toBeDefined();
    }
  });
});

describe('Concurrent withSchema Usage', () => {
  it('should handle multiple concurrent requests with withSchema', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const requests = Array.from({ length: 10 }, (_, i) =>
      createMockRequest({ email: `user${i}@example.com`, name: `User ${i}` })
    );

    const responses = await Promise.all(
      requests.map(request => wrappedHandler(request))
    );

    expect(handler).toHaveBeenCalledTimes(10);
    expect(responses.every(r => r instanceof Response)).toBe(true);
  });

  it('should handle multiple concurrent requests with withApiSchema', async () => {
    const adapter = new ZodAdapter(userSchema);
    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.status(200).json({ user: data });
    });

    const wrappedHandler = withApiSchema(adapter, handler);

    const requestsAndResponses = Array.from({ length: 10 }, (_, i) => ({
      req: createMockNextApiRequest({ email: `user${i}@example.com`, name: `User ${i}` }),
      res: createMockNextApiResponse(),
    }));

    await Promise.all(
      requestsAndResponses.map(({ req, res }) => wrappedHandler(req, res))
    );

    expect(handler).toHaveBeenCalledTimes(10);
    requestsAndResponses.forEach(({ res }) => {
      expect(res.statusCode).toBe(200);
    });
  });
});

describe('FormData handling edge cases', () => {
  it('should handle multiple values for the same key', async () => {
    const multiValueSchema = z.object({
      tags: z.union([z.string(), z.array(z.string())]),
      name: z.string(),
    });

    const adapter = new ZodAdapter(multiValueSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ data });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const formData = new FormData();
    formData.append('name', 'Test');
    formData.append('tags', 'tag1');
    formData.append('tags', 'tag2');

    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      body: formData,
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(Array.isArray(body.data.tags)).toBe(true);
  });

  it('should handle File objects in FormData', async () => {
    const fileSchema = z.object({
      name: z.string(),
      file: z.instanceof(File),
    });

    const adapter = new ZodAdapter(fileSchema);
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ fileName: data.file.name });
    });

    const wrappedHandler = withSchema(adapter, handler);

    const formData = new FormData();
    formData.append('name', 'Test');
    formData.append('file', new File(['content'], 'test.txt', { type: 'text/plain' }));

    const request = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      body: formData,
    });

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.fileName).toBe('test.txt');
  });
});
