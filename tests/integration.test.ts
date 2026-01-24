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

/**
 * Integration tests for realistic API scenarios
 */

// ============================================================================
// Realistic Schema Definitions
// ============================================================================

const userRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
});

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  price: z.number().positive(),
  quantity: z.number().int().min(0),
  categories: z.array(z.string()).min(1).max(10),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['relevance', 'date', 'price']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filters: z.object({
    minPrice: z.coerce.number().optional(),
    maxPrice: z.coerce.number().optional(),
    categories: z.array(z.string()).optional(),
  }).optional(),
});

const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(2).max(2),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.literal('US'),
  }),
  paymentMethod: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('card'),
      cardNumber: z.string().regex(/^\d{16}$/),
      expiry: z.string().regex(/^\d{2}\/\d{2}$/),
      cvv: z.string().regex(/^\d{3,4}$/),
    }),
    z.object({
      type: z.literal('paypal'),
      email: z.string().email(),
    }),
  ]),
  couponCode: z.string().optional(),
});

// ============================================================================
// Form Request Classes
// ============================================================================

class UserRegistrationRequest extends FormRequest<z.infer<typeof userRegistrationSchema>> {
  rules() {
    return new ZodAdapter(userRegistrationSchema);
  }

  messages() {
    return {
      'email.invalid_string': 'Please provide a valid email address',
      'password.too_small': 'Password must be at least 8 characters',
    };
  }

  beforeValidation() {
    // Normalize email
    if (this.body.email && typeof this.body.email === 'string') {
      this.body.email = this.body.email.toLowerCase().trim();
    }
    // Trim names
    if (typeof this.body.firstName === 'string') {
      this.body.firstName = this.body.firstName.trim();
    }
    if (typeof this.body.lastName === 'string') {
      this.body.lastName = this.body.lastName.trim();
    }
  }
}

class ProductRequest extends FormRequest<z.infer<typeof productSchema>> {
  private isAdmin = false;

  setAdmin(value: boolean) {
    this.isAdmin = value;
  }

  rules() {
    return new ZodAdapter(productSchema);
  }

  authorize() {
    return this.isAdmin;
  }

  beforeValidation() {
    // Sanitize input
    if (typeof this.body.name === 'string') {
      this.body.name = this.body.name.trim();
    }
    if (typeof this.body.description === 'string') {
      this.body.description = this.body.description.trim();
    }
  }

  attributes() {
    return {
      categories: 'product categories',
      price: 'product price',
    };
  }
}

class SearchRequest extends FormRequest<z.infer<typeof searchSchema>> {
  rules() {
    return new ZodAdapter(searchSchema);
  }

  protected getDataForValidation() {
    // Merge query params into validation data
    return {
      query: this.input('query') || this.input('q'),
      page: this.input('page'),
      limit: this.input('limit') || this.input('perPage'),
      sortBy: this.input('sortBy') || this.input('sort'),
      sortOrder: this.input('sortOrder') || this.input('order'),
      filters: this.body.filters,
    };
  }
}

class OrderRequest extends FormRequest<z.infer<typeof orderSchema>> {
  private userId: string | null = null;

  setUserId(id: string) {
    this.userId = id;
  }

  rules() {
    return new ZodAdapter(orderSchema);
  }

  async authorize() {
    // Simulate async auth check
    await new Promise(resolve => setTimeout(resolve, 5));
    return this.userId !== null;
  }

  messages() {
    return {
      'items.too_small': 'Order must contain at least one item',
      'shippingAddress.zipCode.invalid_string': 'Please enter a valid ZIP code',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createAppRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Request {
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

function createPagesRequest(options: {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
}): any {
  return {
    method: options.method ?? 'POST',
    body: options.body ?? {},
    query: options.query ?? {},
    headers: options.headers ?? { 'content-type': 'application/json' },
  };
}

function createMockResponse(): any {
  return {
    statusCode: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
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
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: User Registration Flow', () => {
  const validRegistration = {
    email: 'Test@Example.com',
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    firstName: '  John  ',
    lastName: '  Doe  ',
    acceptTerms: true,
  };

  it('should successfully register a user with valid data', async () => {
    const request = createAppRequest({ body: validRegistration });
    const form = await UserRegistrationRequest.fromAppRouter(request);
    const data = await form.validate();

    expect(data.email).toBe('test@example.com'); // Normalized
    expect(data.firstName).toBe('John'); // Trimmed
    expect(data.lastName).toBe('Doe'); // Trimmed
    expect(data.acceptTerms).toBe(true);
  });

  it('should fail when passwords do not match', async () => {
    const request = createAppRequest({
      body: {
        ...validRegistration,
        confirmPassword: 'DifferentPassword123',
      },
    });

    const form = await UserRegistrationRequest.fromAppRouter(request);

    try {
      await form.validate();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors.confirmPassword).toContain('Passwords must match');
    }
  });

  it('should fail with weak password', async () => {
    const request = createAppRequest({
      body: {
        ...validRegistration,
        password: 'weakpass', // No uppercase, no number
        confirmPassword: 'weakpass',
      },
    });

    const form = await UserRegistrationRequest.fromAppRouter(request);

    try {
      await form.validate();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.errors.password).toBeDefined();
    }
  });

  it('should fail when terms not accepted', async () => {
    const request = createAppRequest({
      body: {
        ...validRegistration,
        acceptTerms: false,
      },
    });

    const form = await UserRegistrationRequest.fromAppRouter(request);

    await expect(form.validate()).rejects.toThrow(ValidationError);
  });

  it('should use custom error messages', async () => {
    const request = createAppRequest({
      body: {
        ...validRegistration,
        email: 'invalid-email',
      },
    });

    const form = await UserRegistrationRequest.fromAppRouter(request);

    try {
      await form.validate();
    } catch (error) {
      const validationError = error as ValidationError;
      expect(validationError.errors.email).toContain('Please provide a valid email address');
    }
  });
});

describe('Integration: Product CRUD with Authorization', () => {
  const validProduct = {
    name: 'Awesome Product',
    description: 'This is an awesome product description',
    price: 29.99,
    quantity: 100,
    categories: ['electronics', 'gadgets'],
  };

  it('should allow admin to create product', async () => {
    const request = createAppRequest({ body: validProduct });
    const form = await ProductRequest.fromAppRouter(request);
    form.setAdmin(true);

    const data = await form.validate();

    expect(data.name).toBe('Awesome Product');
    expect(data.price).toBe(29.99);
    expect(data.categories).toHaveLength(2);
  });

  it('should reject non-admin users', async () => {
    const request = createAppRequest({ body: validProduct });
    const form = await ProductRequest.fromAppRouter(request);
    form.setAdmin(false);

    await expect(form.validate()).rejects.toThrow(AuthorizationError);
  });

  it('should validate price is positive', async () => {
    const request = createAppRequest({
      body: {
        ...validProduct,
        price: -10,
      },
    });

    const form = await ProductRequest.fromAppRouter(request);
    form.setAdmin(true);

    await expect(form.validate()).rejects.toThrow(ValidationError);
  });

  it('should require at least one category', async () => {
    const request = createAppRequest({
      body: {
        ...validProduct,
        categories: [],
      },
    });

    const form = await ProductRequest.fromAppRouter(request);
    form.setAdmin(true);

    try {
      await form.validate();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors.categories).toBeDefined();
    }
  });

  it('should handle optional metadata', async () => {
    const request = createAppRequest({
      body: {
        ...validProduct,
        metadata: {
          sku: 'PROD-001',
          warehouse: 'A1',
        },
      },
    });

    const form = await ProductRequest.fromAppRouter(request);
    form.setAdmin(true);

    const data = await form.validate();

    expect(data.metadata).toEqual({ sku: 'PROD-001', warehouse: 'A1' });
  });
});

describe('Integration: Search with Query Params', () => {
  it('should build search from query params', async () => {
    const request = new Request(
      'http://localhost:3000/api/search?query=laptop&page=2&limit=50&sortBy=price&sortOrder=asc',
      { method: 'GET' }
    );

    const form = await SearchRequest.fromAppRouter(request);
    const data = await form.validate();

    expect(data.query).toBe('laptop');
    expect(data.page).toBe(2);
    expect(data.limit).toBe(50);
    expect(data.sortBy).toBe('price');
    expect(data.sortOrder).toBe('asc');
  });

  it('should use defaults for missing params', async () => {
    const request = new Request(
      'http://localhost:3000/api/search?query=laptop',
      { method: 'GET' }
    );

    const form = await SearchRequest.fromAppRouter(request);
    const data = await form.validate();

    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.sortBy).toBe('relevance');
    expect(data.sortOrder).toBe('desc');
  });

  it('should support alternative param names', async () => {
    const request = new Request(
      'http://localhost:3000/api/search?q=laptop&perPage=30&sort=date&order=asc',
      { method: 'GET' }
    );

    const form = await SearchRequest.fromAppRouter(request);
    const data = await form.validate();

    expect(data.query).toBe('laptop');
    expect(data.limit).toBe(30);
    expect(data.sortBy).toBe('date');
  });

  it('should validate limit constraints', async () => {
    const request = new Request(
      'http://localhost:3000/api/search?query=laptop&limit=500',
      { method: 'GET' }
    );

    const form = await SearchRequest.fromAppRouter(request);

    await expect(form.validate()).rejects.toThrow(ValidationError);
  });

  it('should handle POST with filters', async () => {
    const request = createAppRequest({
      url: 'http://localhost:3000/api/search?query=laptop&page=1',
      body: {
        filters: {
          minPrice: 100,
          maxPrice: 2000,
          categories: ['laptops', 'computers'],
        },
      },
    });

    const form = await SearchRequest.fromAppRouter(request);
    const data = await form.validate();

    expect(data.filters?.minPrice).toBe(100);
    expect(data.filters?.maxPrice).toBe(2000);
    expect(data.filters?.categories).toEqual(['laptops', 'computers']);
  });
});

describe('Integration: Order Processing', () => {
  const validOrder = {
    items: [
      { productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 },
      { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 },
    ],
    shippingAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US',
    },
    paymentMethod: {
      type: 'card',
      cardNumber: '4111111111111111',
      expiry: '12/25',
      cvv: '123',
    },
  };

  it('should process valid order with card payment', async () => {
    const request = createAppRequest({ body: validOrder });
    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    const data = await form.validate();

    expect(data.items).toHaveLength(2);
    expect(data.paymentMethod.type).toBe('card');
    expect(data.shippingAddress.state).toBe('NY');
  });

  it('should process valid order with PayPal payment', async () => {
    const request = createAppRequest({
      body: {
        ...validOrder,
        paymentMethod: {
          type: 'paypal',
          email: 'user@paypal.com',
        },
      },
    });

    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    const data = await form.validate();

    expect(data.paymentMethod.type).toBe('paypal');
  });

  it('should reject order without authentication', async () => {
    const request = createAppRequest({ body: validOrder });
    const form = await OrderRequest.fromAppRouter(request);
    // Not setting userId

    await expect(form.validate()).rejects.toThrow(AuthorizationError);
  });

  it('should validate empty order items', async () => {
    const request = createAppRequest({
      body: {
        ...validOrder,
        items: [],
      },
    });

    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    try {
      await form.validate();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors.items).toBeDefined();
    }
  });

  it('should validate ZIP code format', async () => {
    const request = createAppRequest({
      body: {
        ...validOrder,
        shippingAddress: {
          ...validOrder.shippingAddress,
          zipCode: 'invalid',
        },
      },
    });

    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    await expect(form.validate()).rejects.toThrow(ValidationError);
  });

  it('should validate invalid payment method discriminator', async () => {
    const request = createAppRequest({
      body: {
        ...validOrder,
        paymentMethod: {
          type: 'bitcoin', // Not supported
          address: 'abc123',
        },
      },
    });

    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    await expect(form.validate()).rejects.toThrow(ValidationError);
  });
});

describe('Integration: App Router Wrapper with Error Handling', () => {
  const apiWrapper = createAppRouterWrapper({
    onValidationError: (error) => {
      return Response.json({
        success: false,
        type: 'validation',
        errors: error.errors,
        message: error.message,
      }, { status: 422 });
    },
    onAuthorizationError: (error) => {
      return Response.json({
        success: false,
        type: 'authorization',
        message: error.message,
      }, { status: 403 });
    },
    onError: (error) => {
      return Response.json({
        success: false,
        type: 'server',
        message: error instanceof Error ? error.message : 'Internal server error',
      }, { status: 500 });
    },
  });

  it('should handle successful registration', async () => {
    const handler = vi.fn().mockImplementation((data) => {
      return Response.json({
        success: true,
        user: { id: '123', email: data.email },
      }, { status: 201 });
    });

    const route = apiWrapper(UserRegistrationRequest, handler);

    const request = createAppRequest({
      body: {
        email: 'Test@Example.com',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true,
      },
    });

    const response = await route(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('test@example.com');
  });

  it('should handle validation errors', async () => {
    const handler = vi.fn();
    const route = apiWrapper(UserRegistrationRequest, handler);

    const request = createAppRequest({
      body: {
        email: 'invalid',
        password: 'weak',
        confirmPassword: 'different',
        firstName: '',
        lastName: '',
        acceptTerms: false,
      },
    });

    const response = await route(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.type).toBe('validation');
    expect(body.errors).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle authorization errors', async () => {
    // ProductRequest requires admin
    const handler = vi.fn().mockReturnValue(Response.json({ success: true }));

    // Custom wrapper to set admin state
    const productRoute = async (request: Request) => {
      const form = await ProductRequest.fromAppRouter(request);
      form.setAdmin(false); // Not admin

      try {
        const data = await form.validate();
        return handler(data);
      } catch (error) {
        if (error instanceof AuthorizationError) {
          return Response.json({ success: false, type: 'authorization' }, { status: 403 });
        }
        throw error;
      }
    };

    const request = createAppRequest({
      body: {
        name: 'Product',
        price: 10,
        quantity: 5,
        categories: ['test'],
      },
    });

    const response = await productRoute(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Integration: Pages Router API with Error Handling', () => {
  const apiWrapper = createPagesRouterWrapper({
    onValidationError: (error, req, res) => {
      res.status(422).json({
        success: false,
        type: 'validation',
        errors: error.errors,
      });
    },
    onAuthorizationError: (error, req, res) => {
      res.status(403).json({
        success: false,
        type: 'authorization',
        message: error.message,
      });
    },
  });

  it('should handle successful search via Pages Router', async () => {
    const handler = vi.fn().mockImplementation((data, req, res) => {
      res.status(200).json({
        success: true,
        results: [],
        pagination: {
          page: data.page,
          limit: data.limit,
        },
      });
    });

    const route = apiWrapper(SearchRequest, handler);

    const req = createPagesRequest({
      method: 'GET',
      query: { query: 'laptop', page: '1', limit: '20' },
    });
    const res = createMockResponse();

    await route(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.pagination.page).toBe(1);
  });

  it('should handle validation errors via Pages Router', async () => {
    const handler = vi.fn();
    const route = apiWrapper(SearchRequest, handler);

    const req = createPagesRequest({
      method: 'GET',
      query: { query: '', limit: '500' }, // Empty query, limit too high
    });
    const res = createMockResponse();

    await route(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._json.success).toBe(false);
    expect(res._json.type).toBe('validation');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Integration: Complex Validation Scenarios', () => {
  it('should handle deeply nested validation errors', async () => {
    const request = createAppRequest({
      body: {
        items: [
          { productId: 'not-a-uuid', quantity: -1 },
          { productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 },
        ],
        shippingAddress: {
          street: '',
          city: '',
          state: 'XY',
          zipCode: 'invalid',
          country: 'US',
        },
        paymentMethod: {
          type: 'card',
          cardNumber: '123',
          expiry: '99/99',
          cvv: 'abc',
        },
      },
    });

    const form = await OrderRequest.fromAppRouter(request);
    form.setUserId('user-123');

    try {
      await form.validate();
    } catch (error) {
      const validationError = error as ValidationError;

      // Check for nested errors
      expect(validationError.errors).toBeDefined();
      expect(Object.keys(validationError.errors).length).toBeGreaterThan(0);
    }
  });

  it('should validate all fields before reporting errors', async () => {
    const request = createAppRequest({
      body: {
        email: 'invalid',
        password: 'x',
        confirmPassword: 'y',
        firstName: '',
        lastName: '',
        acceptTerms: false,
      },
    });

    const form = await UserRegistrationRequest.fromAppRouter(request);

    try {
      await form.validate();
    } catch (error) {
      const validationError = error as ValidationError;

      // Should have errors for multiple fields
      expect(validationError.errors.email).toBeDefined();
      expect(validationError.errors.password).toBeDefined();
      expect(validationError.errors.firstName).toBeDefined();
      expect(validationError.errors.lastName).toBeDefined();
    }
  });
});

describe('Integration: Concurrent Request Handling', () => {
  it('should handle many concurrent registrations', async () => {
    const requests = Array.from({ length: 20 }, (_, i) =>
      createAppRequest({
        body: {
          email: `user${i}@example.com`,
          password: `SecurePass${i}!`,
          confirmPassword: `SecurePass${i}!`,
          firstName: `User`,
          lastName: `${i}`,
          acceptTerms: true,
        },
      })
    );

    const results = await Promise.all(
      requests.map(async (request) => {
        const form = await UserRegistrationRequest.fromAppRouter(request);
        return form.validate();
      })
    );

    results.forEach((data, i) => {
      expect(data.email).toBe(`user${i}@example.com`);
      expect(data.lastName).toBe(`${i}`);
    });
  });

  it('should isolate validation state between concurrent requests', async () => {
    const validRequest = createAppRequest({
      body: {
        email: 'valid@example.com',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
        firstName: 'Valid',
        lastName: 'User',
        acceptTerms: true,
      },
    });

    const invalidRequest = createAppRequest({
      body: {
        email: 'invalid',
        password: 'x',
        confirmPassword: 'y',
        firstName: '',
        lastName: '',
        acceptTerms: false,
      },
    });

    // Run concurrently
    const [validResult, invalidResult] = await Promise.allSettled([
      (async () => {
        const form = await UserRegistrationRequest.fromAppRouter(validRequest);
        return form.validate();
      })(),
      (async () => {
        const form = await UserRegistrationRequest.fromAppRouter(invalidRequest);
        return form.validate();
      })(),
    ]);

    expect(validResult.status).toBe('fulfilled');
    expect(invalidResult.status).toBe('rejected');
  });
});

describe('Integration: Request Body Preservation', () => {
  it('should preserve original request for handler access', async () => {
    let originalRequest: Request | null = null;

    const handler = vi.fn().mockImplementation((data, req) => {
      originalRequest = req;
      return Response.json({ success: true });
    });

    const route = withRequest(UserRegistrationRequest, handler);

    const request = createAppRequest({
      body: {
        email: 'test@example.com',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
        firstName: 'Test',
        lastName: 'User',
        acceptTerms: true,
      },
    });

    await route(request);

    expect(originalRequest).toBe(request);
  });

  it('should provide validated data separately from raw input', async () => {
    let rawInput: Record<string, unknown> = {};
    let validatedData: z.infer<typeof userRegistrationSchema> | null = null;

    const handler = vi.fn().mockImplementation((data, req, formRequest) => {
      rawInput = formRequest.all();
      validatedData = data;
      return Response.json({ success: true });
    });

    const route = withRequest(UserRegistrationRequest, handler);

    const request = createAppRequest({
      body: {
        email: '  TEST@EXAMPLE.COM  ',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
        firstName: '  Test  ',
        lastName: '  User  ',
        acceptTerms: true,
        extraField: 'should be in raw but not validated',
      },
    });

    await route(request);

    // Raw input should have normalized email (from beforeValidation)
    expect(rawInput.email).toBe('test@example.com');
    // But also extra fields
    expect(rawInput.extraField).toBe('should be in raw but not validated');

    // Validated data should be clean
    expect(validatedData!.email).toBe('test@example.com');
    expect((validatedData as any).extraField).toBeUndefined();
  });
});
