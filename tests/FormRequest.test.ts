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

    it('should get original request object', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.getRequest()).toBe(request);
    });

    it('should return safe partial data', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      // Before validation, safe should be empty
      expect(form.safe()).toEqual({});

      // After validation
      await form.validate();
      expect(form.safe()).toEqual({
        email: 'test@example.com',
        name: 'John',
      });
    });
  });

  describe('edge cases - request parsing', () => {
    it('should handle empty request body', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.all()).toEqual({});
      await expect(form.validate()).rejects.toThrow(ValidationError);
    });

    it('should handle null values in body', async () => {
      const schema = z.object({
        name: z.string().nullable(),
        email: z.string().email(),
      });

      class NullableRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }
      }

      const request = createMockRequest({
        body: { name: null, email: 'test@example.com' },
      });

      const form = await NullableRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.name).toBeNull();
      expect(data.email).toBe('test@example.com');
    });

    it('should handle undefined values in body', async () => {
      const schema = z.object({
        name: z.string().optional(),
        email: z.string().email(),
      });

      class OptionalRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const form = await OptionalRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.name).toBeUndefined();
      expect(data.email).toBe('test@example.com');
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ invalid json }',
      });

      const form = await TestUserRequest.fromAppRouter(request);

      // Should not throw during parsing, just have empty body
      expect(form.all()).toEqual({});
    });

    it('should handle multiple query parameters with same key', async () => {
      const request = new Request('http://localhost:3000/api/test?tag=a&tag=b&tag=c', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);

      // Should return array for multiple values
      expect(form.input('tag')).toEqual(['a', 'b', 'c']);
    });

    it('should handle query params with special characters', async () => {
      const request = new Request('http://localhost:3000/api/test?fullName=John%20Doe&searchEmail=test%40example.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);

      // Query params with special characters should be decoded
      expect(form.input('fullName')).toBe('John Doe');
      expect(form.input('searchEmail')).toBe('test@example.com');
    });

    it('should handle unicode in body', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: '日本語テスト' },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.name).toBe('日本語テスト');
    });

    it('should handle emoji in body', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John 🚀' },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.name).toBe('John 🚀');
    });

    it('should handle very long string values', async () => {
      const longName = 'a'.repeat(10000);
      const request = createMockRequest({
        body: { email: 'test@example.com', name: longName },
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.name).toBe(longName);
      expect(data.name.length).toBe(10000);
    });

    it('should handle nested objects in body', async () => {
      const nestedSchema = z.object({
        user: z.object({
          email: z.string().email(),
          profile: z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        }),
      });

      class NestedRequest extends FormRequest<z.infer<typeof nestedSchema>> {
        rules() {
          return new ZodAdapter(nestedSchema);
        }
      }

      const request = createMockRequest({
        body: {
          user: {
            email: 'test@example.com',
            profile: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
        },
      });

      const form = await NestedRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.user.email).toBe('test@example.com');
      expect(data.user.profile.firstName).toBe('John');
    });

    it('should handle arrays in body', async () => {
      const arraySchema = z.object({
        tags: z.array(z.string()),
        scores: z.array(z.number()),
      });

      class ArrayRequest extends FormRequest<z.infer<typeof arraySchema>> {
        rules() {
          return new ZodAdapter(arraySchema);
        }
      }

      const request = createMockRequest({
        body: {
          tags: ['javascript', 'typescript', 'react'],
          scores: [95, 87, 92],
        },
      });

      const form = await ArrayRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.tags).toEqual(['javascript', 'typescript', 'react']);
      expect(data.scores).toEqual([95, 87, 92]);
    });

    it('should handle multipart/form-data', async () => {
      const formData = new FormData();
      formData.append('email', 'test@example.com');
      formData.append('name', 'John');

      const request = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        body: formData,
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
      expect(data.name).toBe('John');
    });
  });

  describe('edge cases - HTTP methods', () => {
    it('should handle PUT request', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
    });

    it('should handle PATCH request', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
    });

    it('should handle DELETE request with body', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
    });

    it('should handle HEAD request (no body parsing)', async () => {
      const schema = z.object({
        search: z.string().optional(),
      });

      class HeadRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }
      }

      const request = new Request('http://localhost:3000/api/test?search=hello', {
        method: 'HEAD',
      });

      const form = await HeadRequest.fromAppRouter(request);
      expect(form.all()).toEqual({});
    });

    it('should handle OPTIONS request (no body parsing)', async () => {
      const schema = z.object({}).passthrough();

      class OptionsRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }
      }

      const request = new Request('http://localhost:3000/api/test', {
        method: 'OPTIONS',
      });

      const form = await OptionsRequest.fromAppRouter(request);
      expect(form.all()).toEqual({});
    });
  });

  describe('edge cases - headers', () => {
    it('should handle case-insensitive header retrieval', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
          'Authorization': 'Bearer token123',
        },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.header('content-type')).toBe('application/json');
      expect(form.header('Content-Type')).toBe('application/json');
      expect(form.header('CONTENT-TYPE')).toBe('application/json');
      expect(form.header('x-custom-header')).toBe('custom-value');
      expect(form.header('authorization')).toBe('Bearer token123');
    });

    it('should return undefined for missing headers', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.header('x-nonexistent')).toBeUndefined();
    });

    it('should handle multiple request headers', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'accept-language': 'en-US',
          'cache-control': 'no-cache',
        },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.header('accept')).toBe('application/json');
      expect(form.header('accept-language')).toBe('en-US');
      expect(form.header('cache-control')).toBe('no-cache');
    });
  });

  describe('edge cases - authorization', () => {
    it('should handle async authorize method', async () => {
      class AsyncAuthRequest extends FormRequest<UserData> {
        private userId: string | null = null;

        setUserId(id: string | null) {
          this.userId = id;
        }

        rules() {
          return new ZodAdapter(userSchema);
        }

        async authorize() {
          // Simulate async auth check
          await new Promise(resolve => setTimeout(resolve, 10));
          return this.userId !== null;
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form1 = await AsyncAuthRequest.fromAppRouter(request);
      form1.setUserId('123');
      const data = await form1.validate();
      expect(data.email).toBe('test@example.com');

      const form2 = await AsyncAuthRequest.fromAppRouter(request);
      form2.setUserId(null);
      await expect(form2.validate()).rejects.toThrow(AuthorizationError);
    });

    it('should call onAuthorizationFailed hook when auth fails', async () => {
      class AuthHookRequest extends FormRequest<UserData> {
        public authFailedCalled = false;

        rules() {
          return new ZodAdapter(userSchema);
        }

        authorize() {
          return false;
        }

        onAuthorizationFailed() {
          this.authFailedCalled = true;
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await AuthHookRequest.fromAppRouter(request);

      try {
        await form.validate();
      } catch {
        // Expected
      }

      expect(form.authFailedCalled).toBe(true);
    });

    it('should handle async onAuthorizationFailed hook', async () => {
      const hookCalls: string[] = [];

      class AsyncAuthHookRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        authorize() {
          return false;
        }

        async onAuthorizationFailed() {
          await new Promise(resolve => setTimeout(resolve, 10));
          hookCalls.push('authFailed');
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await AsyncAuthHookRequest.fromAppRouter(request);

      try {
        await form.validate();
      } catch {
        // Expected
      }

      expect(hookCalls).toContain('authFailed');
    });
  });

  describe('edge cases - hooks', () => {
    it('should handle async beforeValidation hook', async () => {
      class AsyncBeforeRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        async beforeValidation() {
          await new Promise(resolve => setTimeout(resolve, 10));
          this.body.email = String(this.body.email).toLowerCase();
        }
      }

      const request = createMockRequest({
        body: { email: 'TEST@EXAMPLE.COM', name: 'John' },
      });

      const form = await AsyncBeforeRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
    });

    it('should handle async afterValidation hook', async () => {
      const hookCalls: string[] = [];

      class AsyncAfterRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        async afterValidation(data: UserData) {
          await new Promise(resolve => setTimeout(resolve, 10));
          hookCalls.push(`afterValidation:${data.email}`);
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await AsyncAfterRequest.fromAppRouter(request);
      await form.validate();

      expect(hookCalls).toContain('afterValidation:test@example.com');
    });

    it('should handle error thrown in beforeValidation', async () => {
      class ErrorBeforeRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        beforeValidation() {
          throw new Error('Before validation error');
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await ErrorBeforeRequest.fromAppRouter(request);

      await expect(form.validate()).rejects.toThrow('Before validation error');
    });

    it('should handle error thrown in afterValidation', async () => {
      class ErrorAfterRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        afterValidation() {
          throw new Error('After validation error');
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John' },
      });

      const form = await ErrorAfterRequest.fromAppRouter(request);

      await expect(form.validate()).rejects.toThrow('After validation error');
    });

    it('should handle async onValidationFailed hook', async () => {
      const hookCalls: string[] = [];

      class AsyncFailedRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        async onValidationFailed(errors: Record<string, string[]>) {
          await new Promise(resolve => setTimeout(resolve, 10));
          hookCalls.push(`failed:${Object.keys(errors).join(',')}`);
        }
      }

      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await AsyncFailedRequest.fromAppRouter(request);

      try {
        await form.validate();
      } catch {
        // Expected
      }

      expect(hookCalls[0]).toMatch(/failed:/);
    });

    it('should not call afterValidation when validation fails', async () => {
      const hookCalls: string[] = [];

      class TrackingRequest extends FormRequest<UserData> {
        rules() {
          return new ZodAdapter(userSchema);
        }

        afterValidation() {
          hookCalls.push('afterValidation');
        }

        onValidationFailed() {
          hookCalls.push('onValidationFailed');
        }
      }

      const request = createMockRequest({
        body: { email: 'invalid', name: 'J' },
      });

      const form = await TrackingRequest.fromAppRouter(request);

      try {
        await form.validate();
      } catch {
        // Expected
      }

      expect(hookCalls).toContain('onValidationFailed');
      expect(hookCalls).not.toContain('afterValidation');
    });
  });

  describe('edge cases - getDataForValidation override', () => {
    it('should allow custom data for validation', async () => {
      const schema = z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
      });

      class CustomDataRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }

        protected getDataForValidation() {
          return {
            fullName: `${this.body.firstName} ${this.body.lastName}`,
            email: this.body.email,
          };
        }
      }

      const request = createMockRequest({
        body: { firstName: 'John', lastName: 'Doe', email: 'test@example.com' },
      });

      const form = await CustomDataRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.fullName).toBe('John Doe');
      expect(data.email).toBe('test@example.com');
    });

    it('should allow merging query params into validation data', async () => {
      const schema = z.object({
        email: z.string().email(),
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      });

      class MergedDataRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }

        protected getDataForValidation() {
          return {
            ...this.body,
            page: this.input('page'),
            limit: this.input('limit'),
          };
        }
      }

      const request = new Request('http://localhost:3000/api/test?page=1&limit=10', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const form = await MergedDataRequest.fromAppRouter(request);
      const data = await form.validate();

      expect(data.email).toBe('test@example.com');
      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
    });

    it('should allow using route params in validation', async () => {
      const schema = z.object({
        id: z.string().uuid(),
        email: z.string().email(),
      });

      class ParamDataRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }

        protected getDataForValidation() {
          return {
            ...this.body,
            id: this.param('id'),
          };
        }
      }

      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const form = await ParamDataRequest.fromAppRouter(request, {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const data = await form.validate();

      expect(data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('Pages Router specific', () => {
    it('should handle query params as route params', async () => {
      const request = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
        query: { id: '123', slug: 'test-post' },
      });

      const form = await TestUserRequest.fromPagesRouter(request);

      expect(form.param('id')).toBe('123');
      expect(form.param('slug')).toBe('test-post');
    });

    it('should handle null body in Pages Router', async () => {
      const schema = z.object({}).passthrough();

      class EmptyRequest extends FormRequest<z.infer<typeof schema>> {
        rules() {
          return new ZodAdapter(schema);
        }
      }

      const request = {
        method: 'GET',
        body: null,
        query: {},
        headers: {},
      };

      const form = await EmptyRequest.fromPagesRouter(request as any);
      expect(form.all()).toEqual({});
    });

    it('should handle headers in Pages Router', async () => {
      const request = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
        headers: {
          'content-type': 'application/json',
          'x-custom': 'value',
        },
      });

      const form = await TestUserRequest.fromPagesRouter(request);

      // Pages Router uses lowercase header lookup differently
      expect(form.header('x-custom')).toBe('value');
    });

    it('should merge passed params with query in Pages Router', async () => {
      const request = createMockNextApiRequest({
        body: { email: 'test@example.com', name: 'John' },
        query: { id: '123' },
      });

      const form = await TestUserRequest.fromPagesRouter(request, { extra: 'param' });

      expect(form.param('id')).toBe('123');
      expect(form.param('extra')).toBe('param');
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent validations', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        createMockRequest({
          body: { email: `user${i}@example.com`, name: `User ${i}` },
        })
      );

      const forms = await Promise.all(
        requests.map(request => TestUserRequest.fromAppRouter(request))
      );

      const results = await Promise.all(
        forms.map(form => form.validate())
      );

      results.forEach((data, i) => {
        expect(data.email).toBe(`user${i}@example.com`);
        expect(data.name).toBe(`User ${i}`);
      });
    });

    it('should isolate state between instances', async () => {
      class StatefulRequest extends FormRequest<UserData> {
        private counter = 0;

        rules() {
          return new ZodAdapter(userSchema);
        }

        beforeValidation() {
          this.counter++;
          this.body.name = `${this.body.name}-${this.counter}`;
        }

        getCounter() {
          return this.counter;
        }
      }

      const request1 = createMockRequest({
        body: { email: 'test1@example.com', name: 'John' },
      });
      const request2 = createMockRequest({
        body: { email: 'test2@example.com', name: 'Jane' },
      });

      const form1 = await StatefulRequest.fromAppRouter(request1);
      const form2 = await StatefulRequest.fromAppRouter(request2);

      const data1 = await form1.validate();
      const data2 = await form2.validate();

      expect(data1.name).toBe('John-1');
      expect(data2.name).toBe('Jane-1');
      expect(form1.getCounter()).toBe(1);
      expect(form2.getCounter()).toBe(1);
    });
  });

  describe('input method with complex types', () => {
    it('should return correct type for nested input', async () => {
      const request = createMockRequest({
        body: {
          user: { name: 'John', email: 'test@example.com' },
        },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      const user = form.input<{ name: string; email: string }>('user');
      expect(user).toEqual({ name: 'John', email: 'test@example.com' });
    });

    it('should return default for missing nested paths', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      const missing = form.input('nested.path', 'default');
      expect(missing).toBe('default');
    });

    it('should handle boolean input values', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John', active: true },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('active')).toBe(true);
      expect(form.has('active')).toBe(true);
    });

    it('should handle numeric input values', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', name: 'John', age: 25 },
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('age')).toBe(25);
      expect(form.input<number>('age')).toBe(25);
    });

    it('should prefer body over query for same key', async () => {
      const request = new Request('http://localhost:3000/api/test?name=QueryName', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'BodyName' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('name')).toBe('BodyName');
    });

    it('should fall back to query when not in body', async () => {
      const request = new Request('http://localhost:3000/api/test?search=hello', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', name: 'John' }),
      });

      const form = await TestUserRequest.fromAppRouter(request);

      expect(form.input('search')).toBe('hello');
    });
  });
});
