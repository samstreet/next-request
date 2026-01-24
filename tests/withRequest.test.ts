import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { FormRequest } from '../src/core/FormRequest';
import { ZodAdapter } from '../src/adapters/validators/ZodAdapter';
import { ValidationError, AuthorizationError } from '../src/core/errors';
import {
  withRequest,
  withApiRequest,
  createAppRouterWrapper,
  createPagesRouterWrapper,
} from '../src/middleware/withRequest';

// Test schema
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

type UserData = z.infer<typeof userSchema>;

// Test request class
class TestUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(userSchema);
  }
}

// Request class that fails authorization
class UnauthorizedRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(userSchema);
  }

  authorize() {
    return false;
  }
}

// Helper to create mock Request
function createMockRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

describe('withRequest (App Router)', () => {
  it('should pass validated data to handler', async () => {
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withRequest(TestUserRequest, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      request,
      expect.any(FormRequest)
    );
    expect(response).toBeInstanceOf(Response);
  });

  it('should throw ValidationError for invalid data', async () => {
    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withRequest(TestUserRequest, handler);
    const request = createMockRequest({ email: 'invalid', name: 'J' });

    await expect(wrappedHandler(request)).rejects.toThrow(ValidationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should throw AuthorizationError when unauthorized', async () => {
    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withRequest(UnauthorizedRequest, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    await expect(wrappedHandler(request)).rejects.toThrow(AuthorizationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle route params from context', async () => {
    let receivedFormRequest: FormRequest<UserData> | null = null;

    const handler = vi.fn().mockImplementation((data, req, formRequest) => {
      receivedFormRequest = formRequest;
      return Response.json({ user: data });
    });

    const wrappedHandler = withRequest(TestUserRequest, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    await wrappedHandler(request, { params: { id: '123' } });

    expect(receivedFormRequest!.param('id')).toBe('123');
  });

  it('should handle async params (Next.js 15+)', async () => {
    let receivedFormRequest: FormRequest<UserData> | null = null;

    const handler = vi.fn().mockImplementation((data, req, formRequest) => {
      receivedFormRequest = formRequest;
      return Response.json({ user: data });
    });

    const wrappedHandler = withRequest(TestUserRequest, handler);
    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    // Simulate Next.js 15+ async params
    await wrappedHandler(request, { params: Promise.resolve({ id: '456' }) });

    expect(receivedFormRequest!.param('id')).toBe('456');
  });
});

describe('withApiRequest (Pages Router)', () => {
  it('should pass validated data to handler', async () => {
    const handler = vi.fn();
    const wrappedHandler = withApiRequest(TestUserRequest, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(handler).toHaveBeenCalledWith(
      { email: 'test@example.com', name: 'John' },
      req,
      res,
      expect.any(FormRequest)
    );
  });

  it('should throw ValidationError for invalid data', async () => {
    const handler = vi.fn();
    const wrappedHandler = withApiRequest(TestUserRequest, handler);

    const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
    const res = createMockNextApiResponse();

    await expect(wrappedHandler(req, res)).rejects.toThrow(ValidationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should throw AuthorizationError when unauthorized', async () => {
    const handler = vi.fn();
    const wrappedHandler = withApiRequest(UnauthorizedRequest, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await expect(wrappedHandler(req, res)).rejects.toThrow(AuthorizationError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('createAppRouterWrapper', () => {
  it('should handle validation errors with custom handler', async () => {
    const withValidation = createAppRouterWrapper({
      onValidationError: (error) => {
        return Response.json({ errors: error.errors }, { status: 422 });
      },
    });

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(TestUserRequest, handler);

    const request = createMockRequest({ email: 'invalid', name: 'J' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errors).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle authorization errors with custom handler', async () => {
    const withValidation = createAppRouterWrapper({
      onAuthorizationError: () => {
        return Response.json({ message: 'Forbidden' }, { status: 403 });
      },
    });

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(UnauthorizedRequest, handler);

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe('Forbidden');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle generic errors with custom handler', async () => {
    const withValidation = createAppRouterWrapper({
      onError: () => {
        return Response.json({ message: 'Internal error' }, { status: 500 });
      },
    });

    class ErrorRequest extends FormRequest<UserData> {
      rules() {
        return new ZodAdapter(userSchema);
      }

      beforeValidation() {
        throw new Error('Unexpected error');
      }
    }

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(ErrorRequest, handler);

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(500);
  });

  it('should rethrow unhandled errors', async () => {
    const withValidation = createAppRouterWrapper({
      onValidationError: (error) => {
        return Response.json({ errors: error.errors }, { status: 422 });
      },
      // No onError handler
    });

    class ErrorRequest extends FormRequest<UserData> {
      rules() {
        return new ZodAdapter(userSchema);
      }

      beforeValidation() {
        throw new Error('Unexpected error');
      }
    }

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(ErrorRequest, handler);

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });

    await expect(wrappedHandler(request)).rejects.toThrow('Unexpected error');
  });

  it('should pass through successful requests', async () => {
    const withValidation = createAppRouterWrapper({
      onValidationError: (error) => {
        return Response.json({ errors: error.errors }, { status: 422 });
      },
    });

    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data }, { status: 201 });
    });

    const wrappedHandler = withValidation(TestUserRequest, handler);

    const request = createMockRequest({ email: 'test@example.com', name: 'John' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user).toEqual({ email: 'test@example.com', name: 'John' });
  });
});

describe('createPagesRouterWrapper', () => {
  it('should handle validation errors with custom handler', async () => {
    const withValidation = createPagesRouterWrapper({
      onValidationError: (error, req, res) => {
        res.status(422).json({ errors: error.errors });
      },
    });

    const handler = vi.fn();
    const wrappedHandler = withValidation(TestUserRequest, handler);

    const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._json.errors).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle authorization errors with custom handler', async () => {
    const withValidation = createPagesRouterWrapper({
      onAuthorizationError: (error, req, res) => {
        res.status(403).json({ message: 'Forbidden' });
      },
    });

    const handler = vi.fn();
    const wrappedHandler = withValidation(UnauthorizedRequest, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res._json.message).toBe('Forbidden');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should pass through successful requests', async () => {
    const withValidation = createPagesRouterWrapper({
      onValidationError: (error, req, res) => {
        res.status(422).json({ errors: error.errors });
      },
    });

    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.status(201).json({ user: data });
    });

    const wrappedHandler = withValidation(TestUserRequest, handler);

    const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
    const res = createMockNextApiResponse();

    await wrappedHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res._json.user).toEqual({ email: 'test@example.com', name: 'John' });
  });
});

describe('withRequest - Extended Tests', () => {
  describe('context and params handling', () => {
    it('should handle undefined context', async () => {
      const handler = vi.fn().mockReturnValue(Response.json({ success: true }));
      const wrappedHandler = withRequest(TestUserRequest, handler);

      const request = createMockRequest({ email: 'test@example.com', name: 'John' });
      await wrappedHandler(request);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle empty params object', async () => {
      const handler = vi.fn().mockReturnValue(Response.json({ success: true }));
      const wrappedHandler = withRequest(TestUserRequest, handler);

      const request = createMockRequest({ email: 'test@example.com', name: 'John' });
      await wrappedHandler(request, { params: {} });

      expect(handler).toHaveBeenCalled();
    });

    it('should handle multiple route params', async () => {
      let receivedFormRequest: FormRequest<UserData> | null = null;

      const handler = vi.fn().mockImplementation((data, req, formRequest) => {
        receivedFormRequest = formRequest;
        return Response.json({ success: true });
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });

      await wrappedHandler(request, {
        params: { userId: '123', postId: '456', commentId: '789' }
      });

      expect(receivedFormRequest!.param('userId')).toBe('123');
      expect(receivedFormRequest!.param('postId')).toBe('456');
      expect(receivedFormRequest!.param('commentId')).toBe('789');
    });

    it('should handle params with special characters', async () => {
      let receivedFormRequest: FormRequest<UserData> | null = null;

      const handler = vi.fn().mockImplementation((data, req, formRequest) => {
        receivedFormRequest = formRequest;
        return Response.json({ success: true });
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });

      await wrappedHandler(request, {
        params: { slug: 'my-awesome-post', category: 'tech/programming' }
      });

      expect(receivedFormRequest!.param('slug')).toBe('my-awesome-post');
      expect(receivedFormRequest!.param('category')).toBe('tech/programming');
    });
  });

  describe('handler return types', () => {
    it('should handle Response with custom headers', async () => {
      const handler = vi.fn().mockImplementation(() => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
          },
        });
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });
      const response = await wrappedHandler(request);

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
    });

    it('should handle streaming response', async () => {
      const handler = vi.fn().mockImplementation(() => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('chunk1'));
            controller.enqueue(new TextEncoder().encode('chunk2'));
            controller.close();
          },
        });
        return new Response(stream);
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });
      const response = await wrappedHandler(request);

      expect(response.body).toBeDefined();
    });

    it('should handle different status codes', async () => {
      const statusCodes = [200, 201, 204, 400, 404, 500];

      for (const status of statusCodes) {
        const handler = vi.fn().mockImplementation(() => {
          return new Response(null, { status });
        });

        const wrappedHandler = withRequest(TestUserRequest, handler);
        const request = createMockRequest({ email: 'test@example.com', name: 'John' });
        const response = await wrappedHandler(request);

        expect(response.status).toBe(status);
      }
    });
  });

  describe('handler exceptions', () => {
    it('should propagate handler exceptions', async () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });

      await expect(wrappedHandler(request)).rejects.toThrow('Handler error');
    });

    it('should propagate async handler exceptions', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async handler error');
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = createMockRequest({ email: 'test@example.com', name: 'John' });

      await expect(wrappedHandler(request)).rejects.toThrow('Async handler error');
    });
  });

  describe('form request access in handler', () => {
    it('should provide access to query params via formRequest', async () => {
      let capturedQuery: string | undefined;

      const handler = vi.fn().mockImplementation((data, req, formRequest) => {
        capturedQuery = formRequest.input('search') as string;
        return Response.json({ success: true });
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = new Request('http://localhost/api?search=test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      await wrappedHandler(request);

      expect(capturedQuery).toBe('test');
    });

    it('should provide access to headers via formRequest', async () => {
      let capturedHeader: string | undefined;

      const handler = vi.fn().mockImplementation((data, req, formRequest) => {
        capturedHeader = formRequest.header('x-custom') as string;
        return Response.json({ success: true });
      });

      const wrappedHandler = withRequest(TestUserRequest, handler);
      const request = new Request('http://localhost/api', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-custom': 'custom-value',
        },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      await wrappedHandler(request);

      expect(capturedHeader).toBe('custom-value');
    });
  });
});

describe('withApiRequest - Extended Tests', () => {
  describe('request data access', () => {
    it('should pass query params through formRequest', async () => {
      let capturedParams: Record<string, string | undefined> = {};

      const handler = vi.fn().mockImplementation((data, req, res, formRequest) => {
        capturedParams = {
          id: formRequest.param('id'),
          action: formRequest.input('action') as string,
        };
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withApiRequest(TestUserRequest, handler);
      const req = {
        method: 'POST',
        body: { email: 'test@example.com', name: 'John' },
        query: { id: '123', action: 'update' },
        headers: { 'content-type': 'application/json' },
      };
      const res = createMockNextApiResponse();

      await wrappedHandler(req as any, res);

      expect(capturedParams.id).toBe('123');
      expect(capturedParams.action).toBe('update');
    });

    it('should handle array query params', async () => {
      let capturedTags: unknown;

      const handler = vi.fn().mockImplementation((data, req, res, formRequest) => {
        capturedTags = formRequest.input('tags');
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withApiRequest(TestUserRequest, handler);
      const req = {
        method: 'POST',
        body: { email: 'test@example.com', name: 'John' },
        query: { tags: ['a', 'b', 'c'] },
        headers: { 'content-type': 'application/json' },
      };
      const res = createMockNextApiResponse();

      await wrappedHandler(req as any, res);

      expect(capturedTags).toEqual(['a', 'b', 'c']);
    });
  });

  describe('response handling', () => {
    it('should allow handler to set custom headers', async () => {
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
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withApiRequest(TestUserRequest, handler);
      const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });

      await wrappedHandler(req, res);

      expect(res._headers['X-Custom']).toBe('value');
    });
  });
});

describe('createAppRouterWrapper - Extended Tests', () => {
  describe('error handler combinations', () => {
    it('should handle only validation errors when only that handler is provided', async () => {
      const withValidation = createAppRouterWrapper({
        onValidationError: (error) => {
          return Response.json({ type: 'validation', errors: error.errors }, { status: 422 });
        },
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));
      const wrappedHandler = withValidation(TestUserRequest, handler);

      // Validation error should be handled
      const invalidRequest = createMockRequest({ email: 'invalid', name: 'J' });
      const response1 = await wrappedHandler(invalidRequest);
      expect(response1.status).toBe(422);

      // Auth error should throw (no handler)
      const validRequest = createMockRequest({ email: 'test@example.com', name: 'John' });
      const wrappedUnauth = withValidation(UnauthorizedRequest, handler);
      await expect(wrappedUnauth(validRequest)).rejects.toThrow(AuthorizationError);
    });

    it('should handle only auth errors when only that handler is provided', async () => {
      const withAuth = createAppRouterWrapper({
        onAuthorizationError: () => {
          return Response.json({ type: 'auth' }, { status: 403 });
        },
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));

      // Auth error should be handled
      const wrappedUnauth = withAuth(UnauthorizedRequest, handler);
      const validRequest = createMockRequest({ email: 'test@example.com', name: 'John' });
      const response1 = await wrappedUnauth(validRequest);
      expect(response1.status).toBe(403);

      // Validation error should throw (no handler)
      const wrappedValid = withAuth(TestUserRequest, handler);
      const invalidRequest = createMockRequest({ email: 'invalid', name: 'J' });
      await expect(wrappedValid(invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle all error types when all handlers provided', async () => {
      const withAll = createAppRouterWrapper({
        onValidationError: () => Response.json({ type: 'validation' }, { status: 422 }),
        onAuthorizationError: () => Response.json({ type: 'auth' }, { status: 403 }),
        onError: () => Response.json({ type: 'generic' }, { status: 500 }),
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));

      // Test validation error
      const wrappedValid = withAll(TestUserRequest, handler);
      const response1 = await wrappedValid(createMockRequest({ email: 'invalid', name: 'J' }));
      expect(response1.status).toBe(422);

      // Test auth error
      const wrappedUnauth = withAll(UnauthorizedRequest, handler);
      const response2 = await wrappedUnauth(createMockRequest({ email: 'test@example.com', name: 'John' }));
      expect(response2.status).toBe(403);

      // Test generic error
      class ErrorRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }
        beforeValidation() {
          throw new Error('Unexpected');
        }
      }
      const wrappedError = withAll(ErrorRequest, handler);
      const response3 = await wrappedError(createMockRequest({ email: 'test@example.com', name: 'John' }));
      expect(response3.status).toBe(500);
    });
  });

  describe('error information access', () => {
    it('should provide full ValidationError in handler', async () => {
      let capturedError: ValidationError | null = null;

      const withValidation = createAppRouterWrapper({
        onValidationError: (error) => {
          capturedError = error;
          return Response.json({
            errors: error.errors,
            message: error.message,
            allMessages: error.getAllMessages(),
          }, { status: 422 });
        },
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));
      const wrappedHandler = withValidation(TestUserRequest, handler);

      const request = createMockRequest({ email: 'invalid', name: 'J' });
      await wrappedHandler(request);

      expect(capturedError).toBeInstanceOf(ValidationError);
      expect(capturedError!.errors.email).toBeDefined();
      expect(capturedError!.errors.name).toBeDefined();
    });

    it('should provide AuthorizationError in handler', async () => {
      let capturedError: AuthorizationError | null = null;

      const withAuth = createAppRouterWrapper({
        onAuthorizationError: (error) => {
          capturedError = error;
          return Response.json({ message: error.message }, { status: 403 });
        },
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));
      const wrappedHandler = withAuth(UnauthorizedRequest, handler);

      const request = createMockRequest({ email: 'test@example.com', name: 'John' });
      await wrappedHandler(request);

      expect(capturedError).toBeInstanceOf(AuthorizationError);
      expect(capturedError!.message).toBe('Unauthorized');
    });
  });

  describe('async error handlers', () => {
    it('should handle async validation error handler', async () => {
      const withValidation = createAppRouterWrapper({
        onValidationError: async (error) => {
          // Simulate async logging
          await new Promise(resolve => setTimeout(resolve, 10));
          return Response.json({ errors: error.errors }, { status: 422 });
        },
      });

      const handler = vi.fn().mockReturnValue(Response.json({}));
      const wrappedHandler = withValidation(TestUserRequest, handler);

      const request = createMockRequest({ email: 'invalid', name: 'J' });
      const response = await wrappedHandler(request);

      expect(response.status).toBe(422);
    });
  });
});

describe('createPagesRouterWrapper - Extended Tests', () => {
  describe('error handler with request/response access', () => {
    it('should provide req and res to validation error handler', async () => {
      let capturedReq: any = null;
      let capturedRes: any = null;

      const withValidation = createPagesRouterWrapper({
        onValidationError: (error, req, res) => {
          capturedReq = req;
          capturedRes = res;
          res.status(422).json({ errors: error.errors });
        },
      });

      const handler = vi.fn();
      const wrappedHandler = withValidation(TestUserRequest, handler);

      const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
      const res = createMockNextApiResponse();

      await wrappedHandler(req, res);

      expect(capturedReq).toBe(req);
      expect(capturedRes).toBe(res);
    });

    it('should provide req and res to authorization error handler', async () => {
      let capturedReq: any = null;

      const withAuth = createPagesRouterWrapper({
        onAuthorizationError: (error, req, res) => {
          capturedReq = req;
          res.status(403).json({ message: 'Forbidden' });
        },
      });

      const handler = vi.fn();
      const wrappedHandler = withAuth(UnauthorizedRequest, handler);

      const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
      const res = createMockNextApiResponse();

      await wrappedHandler(req, res);

      expect(capturedReq).toBe(req);
    });

    it('should provide req and res to generic error handler', async () => {
      let capturedError: unknown = null;

      const withError = createPagesRouterWrapper({
        onError: (error, req, res) => {
          capturedError = error;
          res.status(500).json({ message: 'Internal error' });
        },
      });

      class ErrorRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }
        beforeValidation() {
          throw new Error('Test error');
        }
      }

      const handler = vi.fn();
      const wrappedHandler = withError(ErrorRequest, handler);

      const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
      const res = createMockNextApiResponse();

      await wrappedHandler(req, res);

      expect(capturedError).toBeInstanceOf(Error);
      expect((capturedError as Error).message).toBe('Test error');
    });
  });

  describe('rethrow behavior', () => {
    it('should rethrow validation error when no handler', async () => {
      const withEmpty = createPagesRouterWrapper({});

      const handler = vi.fn();
      const wrappedHandler = withEmpty(TestUserRequest, handler);

      const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
      const res = createMockNextApiResponse();

      await expect(wrappedHandler(req, res)).rejects.toThrow(ValidationError);
    });

    it('should rethrow authorization error when no handler', async () => {
      const withEmpty = createPagesRouterWrapper({});

      const handler = vi.fn();
      const wrappedHandler = withEmpty(UnauthorizedRequest, handler);

      const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
      const res = createMockNextApiResponse();

      await expect(wrappedHandler(req, res)).rejects.toThrow(AuthorizationError);
    });

    it('should rethrow generic error when no handler', async () => {
      const withEmpty = createPagesRouterWrapper({});

      class ErrorRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }
        beforeValidation() {
          throw new Error('Test error');
        }
      }

      const handler = vi.fn();
      const wrappedHandler = withEmpty(ErrorRequest, handler);

      const req = createMockNextApiRequest({ email: 'test@example.com', name: 'John' });
      const res = createMockNextApiResponse();

      await expect(wrappedHandler(req, res)).rejects.toThrow('Test error');
    });
  });

  describe('async error handlers', () => {
    it('should handle async validation error handler', async () => {
      const withValidation = createPagesRouterWrapper({
        onValidationError: async (error, req, res) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          res.status(422).json({ errors: error.errors });
        },
      });

      const handler = vi.fn();
      const wrappedHandler = withValidation(TestUserRequest, handler);

      const req = createMockNextApiRequest({ email: 'invalid', name: 'J' });
      const res = createMockNextApiResponse();

      await wrappedHandler(req, res);

      expect(res.statusCode).toBe(422);
    });
  });
});

describe('Concurrent Wrapper Usage', () => {
  it('should handle multiple concurrent requests with App Router wrapper', async () => {
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({ user: data });
    });

    const wrappedHandler = withRequest(TestUserRequest, handler);

    const requests = Array.from({ length: 10 }, (_, i) =>
      createMockRequest({ email: `user${i}@example.com`, name: `User ${i}` })
    );

    const responses = await Promise.all(
      requests.map(request => wrappedHandler(request))
    );

    expect(handler).toHaveBeenCalledTimes(10);
    expect(responses.every(r => r instanceof Response)).toBe(true);
  });

  it('should handle multiple concurrent requests with Pages Router wrapper', async () => {
    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.status(200).json({ user: data });
    });

    const wrappedHandler = withApiRequest(TestUserRequest, handler);

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

describe('Custom FormRequest with Wrapper', () => {
  it('should work with FormRequest that has custom attributes', async () => {
    class AttributeRequest extends FormRequest<UserData> {
      rules() {
        return new ZodAdapter(userSchema);
      }

      attributes() {
        return {
          email: 'email address',
          name: 'full name',
        };
      }
    }

    const withValidation = createAppRouterWrapper({
      onValidationError: (error) => {
        return Response.json({ errors: error.errors }, { status: 422 });
      },
    });

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(AttributeRequest, handler);

    const request = createMockRequest({ email: 'invalid', name: 'J' });
    const response = await wrappedHandler(request);

    expect(response.status).toBe(422);
  });

  it('should work with FormRequest that has custom messages', async () => {
    class MessageRequest extends FormRequest<UserData> {
      rules() {
        return new ZodAdapter(userSchema);
      }

      messages() {
        return {
          'email.invalid_string': 'Please enter a valid email',
          'name': 'Name is too short',
        };
      }
    }

    let capturedError: ValidationError | null = null;

    const withValidation = createAppRouterWrapper({
      onValidationError: (error) => {
        capturedError = error;
        return Response.json({ errors: error.errors }, { status: 422 });
      },
    });

    const handler = vi.fn().mockReturnValue(Response.json({}));
    const wrappedHandler = withValidation(MessageRequest, handler);

    const request = createMockRequest({ email: 'invalid', name: 'J' });
    await wrappedHandler(request);

    expect(capturedError!.errors.email).toContain('Please enter a valid email');
  });

  it('should work with FormRequest that has beforeValidation', async () => {
    class TransformRequest extends FormRequest<UserData> {
      rules() {
        return new ZodAdapter(userSchema);
      }

      beforeValidation() {
        this.body.email = String(this.body.email).toLowerCase().trim();
      }
    }

    let capturedData: UserData | null = null;

    const handler = vi.fn().mockImplementation((data) => {
      capturedData = data;
      return Response.json({ user: data });
    });

    const wrappedHandler = withRequest(TransformRequest, handler);
    const request = createMockRequest({ email: '  TEST@EXAMPLE.COM  ', name: 'John' });

    await wrappedHandler(request);

    expect(capturedData!.email).toBe('test@example.com');
  });
});
