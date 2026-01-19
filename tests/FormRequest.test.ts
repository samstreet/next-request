import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { FormRequest } from '../src/core/FormRequest';
import { ZodAdapter } from '../src/adapters/validators/ZodAdapter';
import { ValidationError, AuthorizationError } from '../src/core/errors';

// Test schema
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

type UserData = z.infer<typeof userSchema>;

// Basic test request class
class TestUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(userSchema);
  }
}

// Request class with authorization
class AuthorizedRequest extends FormRequest<UserData> {
  private shouldAuthorize = true;

  setAuthorize(value: boolean) {
    this.shouldAuthorize = value;
  }

  rules() {
    return new ZodAdapter(userSchema);
  }

  authorize() {
    return this.shouldAuthorize;
  }
}

// Request class with hooks
class HookedRequest extends FormRequest<UserData> {
  public hooksCalled: string[] = [];

  rules() {
    return new ZodAdapter(userSchema);
  }

  beforeValidation() {
    this.hooksCalled.push('beforeValidation');
    // Normalize email
    if (this.body.email && typeof this.body.email === 'string') {
      this.body.email = this.body.email.toLowerCase().trim();
    }
  }

  afterValidation(data: UserData) {
    this.hooksCalled.push('afterValidation');
  }

  onValidationFailed() {
    this.hooksCalled.push('onValidationFailed');
  }

  onAuthorizationFailed() {
    this.hooksCalled.push('onAuthorizationFailed');
  }
}

// Request class with custom messages
class CustomMessagesRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(userSchema);
  }

  messages() {
    return {
      'email.invalid_string': 'Please provide a valid email address',
      'name': 'Name must be at least 2 characters',
    };
  }

  attributes() {
    return {
      email: 'email address',
    };
  }
}

// Helper to create a mock App Router Request
function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}): Request {
  const {
    method = 'POST',
    url = 'http://localhost:3000/api/test',
    body,
    headers = { 'content-type': 'application/json' },
  } = options;

  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Helper to create a mock Pages Router request
function createMockNextApiRequest(options: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): any {
  const {
    method = 'POST',
    body = {},
    query = {},
    headers = { 'content-type': 'application/json' },
  } = options;

  return {
    method,
    body,
    query,
    headers,
  };
}

describe('FormRequest', () => {
  describe('fromAppRouter', () => {
    it('should create instance from App Router request', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should parse query parameters', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/test?foo=bar&baz=qux',
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('foo')).toBe('bar');
      expect(form.input('baz')).toBe('qux');
    });

    it('should handle route params', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request, { id: '123' });

      expect(form.param('id')).toBe('123');
    });

    it('should handle form-urlencoded body', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'email=test%40example.com&name=John',
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should handle GET requests without body', async () => {
      const simpleSchema = z.object({
        search: z.string().optional(),
      });

      class GetRequest extends FormRequest<z.infer<typeof simpleSchema>> {
        rules() {
          return new ZodAdapter(simpleSchema);
        }

        protected getDataForValidation() {
          return { search: this.input('search') };
        }
      }

      const request = new Request('http://localhost:3000/api/test?search=hello', {
        method: 'GET',
      });

      const form = await GetRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data).toEqual({ search: 'hello' });
    });
  });

  describe('fromPagesRouter', () => {
    it('should create instance from Pages Router request', async () => {
      const request = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromPagesRouter(request);
      const data = await form.validate();

      expect(data).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should handle query parameters', async () => {
      const request = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
        query: { page: '1', limit: '10' },
      });

      const form = await TestUserRequest.fromPagesRouter(request);

      expect(form.input('page')).toBe('1');
      expect(form.input('limit')).toBe('10');
    });
  });

  describe('validation', () => {
    it('should validate successfully with valid data', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
      expect(data.name).toBe('John');
    });

    it('should throw ValidationError for invalid data', async () => {
      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      await expect(form.validate()).rejects.toThrow(ValidationError);
    });

    it('should include field errors in ValidationError', async () => {
      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      try {
        await form.validate();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.errors.email).toBeDefined();
        expect(validationError.errors.name).toBeDefined();
      }
    });
  });

  describe('authorization', () => {
    it('should pass when authorize returns true', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await AuthorizedRequest.fromAppRouter(request);
      form.setAuthorize(true);

      const data = await form.validate();
      expect(data.email).toBe('test@example.com');
    });

    it('should throw AuthorizationError when authorize returns false', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await AuthorizedRequest.fromAppRouter(request);
      form.setAuthorize(false);

      await expect(form.validate()).rejects.toThrow(AuthorizationError);
    });

    it('should check authorization before validation', async () => {
      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' }, // Invalid data
      });

      const form = await AuthorizedRequest.fromAppRouter(request);
      form.setAuthorize(false);

      // Should throw AuthorizationError, not ValidationError
      await expect(form.validate()).rejects.toThrow(AuthorizationError);
    });
  });

  describe('hooks', () => {
    it('should call beforeValidation hook', async () => {
      const request = createMockRequest({
        body: { email: '  TEST@EXAMPLE.COM  ', name: 'John' },
      });

      const form = await HookedRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(form.hooksCalled).toContain('beforeValidation');
      expect(data.email).toBe('test@example.com'); // Normalized
    });

    it('should call afterValidation hook on success', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await HookedRequest.fromAppRouter(request);
      await form.validate();

      expect(form.hooksCalled).toContain('afterValidation');
    });

    it('should call onValidationFailed hook on failure', async () => {
      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await HookedRequest.fromAppRouter(request);

      try {
        await form.validate();
      } catch {
        // Expected
      }

      expect(form.hooksCalled).toContain('onValidationFailed');
      expect(form.hooksCalled).not.toContain('afterValidation');
    });

    it('should call hooks in correct order', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await HookedRequest.fromAppRouter(request);
      await form.validate();

      expect(form.hooksCalled).toEqual(['beforeValidation', 'afterValidation']);
    });
  });

  describe('custom messages', () => {
    it('should use custom validation messages', async () => {
      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await CustomMessagesRequest.fromAppRouter(request);

      try {
        await form.validate();
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        expect(validationError.errors.email).toContain('Please provide a valid email address');
        expect(validationError.errors.name).toContain('Name must be at least 2 characters');
      }
    });
  });

  describe('helper methods', () => {
    it('should return validated data after validation', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      await form.validate();

      expect(form.validated()).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should throw when accessing validated before validation', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(() => form.validated()).toThrow();
    });

    it('should return all input data', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John', extra: 'data' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.all()).toEqual({
        email: 'test@example.com',
        name: 'John',
        extra: 'data',
      });
    });

    it('should check if input has key', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.has('email')).toBe(true);
      expect(form.has('name')).toBe(false);
    });

    it('should return only specified keys', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John', password: 'secret' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.only('email', 'name')).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should return all except specified keys', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John', password: 'secret' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.except('password')).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should get input with default value', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('email')).toBe('test@example.com');
      expect(form.input('missing', 'default')).toBe('default');
    });

    it('should get header value', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'custom-value',
        },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.header('content-type')).toBe('application/json');
      expect(form.header('x-custom-header')).toBe('custom-value');
    });

    it('should check if using App Router', async () => {
      const appRouterRequest = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });
      const pagesRouterRequest = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const appForm = await TestUserRequest.fromAppRouter(appRouterRequest);
      const pagesForm = await TestUserRequest.fromPagesRouter(pagesRouterRequest);

      expect(appForm.isAppRouter()).toBe(true);
      expect(pagesForm.isAppRouter()).toBe(false);
    });
  });
});
