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
