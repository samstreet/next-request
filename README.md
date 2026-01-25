# next-form-request

[![npm version](https://img.shields.io/npm/v/next-form-request.svg)](https://www.npmjs.com/package/next-form-request)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Laravel-inspired Form Request validation for Next.js API routes. Bring the elegance of Laravel's form requests to your Next.js applications with full TypeScript support and type inference.

## Features

- **Laravel-style Form Requests** - Familiar `rules()`, `authorize()`, `beforeValidation()`, and `afterValidation()` hooks
- **Full TypeScript Support** - Complete type inference for validated data with automatic IDE completion
- **Validator Agnostic** - Built-in adapters for Zod, Yup, Valibot, and ArkType, or bring your own
- **Works with Both Routers** - Seamless support for App Router (Next.js 13+) and Pages Router
- **Built-in Rate Limiting** - Protect your endpoints with configurable rate limiting
- **File Upload Validation** - Comprehensive file validation with size, type, and extension checks
- **Automatic Type Coercion** - Convert form data strings to appropriate JavaScript types
- **Flexible Middleware** - Convenient wrapper functions or manual instantiation
- **Comprehensive Testing Utilities** - Helper functions for testing form requests
- **Composition Patterns** - Reusable base classes and composable authorisation logic

## Installation

```bash
npm install next-form-request
```

With your preferred validator:

```bash
# Zod (recommended)
npm install next-form-request zod

# Yup
npm install next-form-request yup

# Valibot
npm install next-form-request valibot

# ArkType
npm install next-form-request arktype
```

## Quick Start

### 1. Define a Form Request

```typescript
// requests/CreateUserRequest.ts
import { FormRequest, ZodAdapter } from 'next-form-request';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
});

export class CreateUserRequest extends FormRequest<z.infer<typeof schema>> {
  rules() {
    return new ZodAdapter(schema);
  }

  async authorize() {
    // Add authorization logic here
    return true;
  }

  beforeValidation() {
    // Normalise input before validation
    if (this.body.email) {
      this.body.email = this.body.email.toLowerCase().trim();
    }
  }
}
```

### 2. Use in Your API Route

**App Router (Next.js 13+)**

```typescript
// app/api/users/route.ts
import { CreateUserRequest } from '@/requests/CreateUserRequest';
import { ValidationError, AuthorizationError } from 'next-form-request';

export async function POST(request: Request) {
  try {
    const form = await CreateUserRequest.fromAppRouter(request);
    const data = await form.validate();

    // data is fully typed as { email: string; name: string; password: string }
    const user = await db.users.create({ data });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ errors: error.errors }, { status: 422 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }
    throw error;
  }
}
```

**Pages Router**

```typescript
// pages/api/users.ts
import { CreateUserRequest } from '@/requests/CreateUserRequest';
import { ValidationError, AuthorizationError } from 'next-form-request';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const form = await CreateUserRequest.fromPagesRouter(req);
    const data = await form.validate();

    const user = await db.users.create({ data });
    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json({ errors: error.errors });
    }
    if (error instanceof AuthorizationError) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    throw error;
  }
}
```

## Core Concepts

### FormRequest Class

The `FormRequest` class is an abstract base class that you extend to create your validation requests. It provides:

- **Lifecycle hooks** for authorization and data transformation
- **Helper methods** for accessing request data
- **Automatic type inference** for validated data
- **Support for both App Router and Pages Router**

### Validation Adapters

Adapters provide a unified interface for different validation libraries. Available adapters:

- `ZodAdapter` - For Zod schemas
- `YupAdapter` - For Yup schemas
- `ValibotAdapter` - For Valibot schemas
- `ArkTypeAdapter` - For ArkType schemas

### Middleware Wrappers

Wrapper functions provide a cleaner API for common use cases:

- `withRequest` - App Router wrapper with full FormRequest features
- `withApiRequest` - Pages Router wrapper with full FormRequest features
- `withSchema` - Lightweight App Router wrapper for schema-only validation
- `withApiSchema` - Lightweight Pages Router wrapper for schema-only validation

## Validation Adapters

### Zod (Recommended)

```typescript
import { FormRequest, ZodAdapter } from 'next-form-request';
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  age: z.number().int().positive().optional(),
  role: z.enum(['user', 'admin']),
});

export class CreateUserRequest extends FormRequest<z.infer<typeof userSchema>> {
  rules() {
    return new ZodAdapter(userSchema);
  }
}
```

### Yup

```typescript
import { FormRequest, YupAdapter } from 'next-form-request';
import * as yup from 'yup';

const userSchema = yup.object({
  email: yup.string().email().required(),
  name: yup.string().min(2).max(50).required(),
  age: yup.number().positive().integer().optional(),
});

export class CreateUserRequest extends FormRequest<yup.InferType<typeof userSchema>> {
  rules() {
    return new YupAdapter(userSchema);
  }
}
```

### Valibot

```typescript
import { FormRequest, ValibotAdapter } from 'next-form-request';
import * as v from 'valibot';

const userSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(50)),
  age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export class CreateUserRequest extends FormRequest<v.InferOutput<typeof userSchema>> {
  rules() {
    return new ValibotAdapter(userSchema);
  }
}
```

### ArkType

```typescript
import { FormRequest, ArkTypeAdapter } from 'next-form-request';
import { type } from 'arktype';

const userSchema = type({
  email: 'email',
  name: 'string>2',
  age: 'number>0',
});

export class CreateUserRequest extends FormRequest<typeof userSchema.infer> {
  rules() {
    return new ArkTypeAdapter(userSchema);
  }
}
```

## Middleware Wrappers

### withRequest (App Router)

Clean wrapper for App Router with full FormRequest lifecycle:

```typescript
// app/api/users/route.ts
import { withRequest } from 'next-form-request';
import { CreateUserRequest } from '@/requests/CreateUserRequest';

export const POST = withRequest(CreateUserRequest, async (data, request, formRequest) => {
  // data is fully typed
  // request is the original Request object
  // formRequest is the CreateUserRequest instance

  const user = await db.users.create({ data });
  return Response.json({ user }, { status: 201 });
});
```

### withApiRequest (Pages Router)

Clean wrapper for Pages Router with full FormRequest lifecycle:

```typescript
// pages/api/users.ts
import { withApiRequest } from 'next-form-request';
import { CreateUserRequest } from '@/requests/CreateUserRequest';

export default withApiRequest(CreateUserRequest, async (data, req, res, formRequest) => {
  // data is fully typed
  const user = await db.users.create({ data });
  res.status(201).json({ user });
});
```

### withSchema (Lightweight App Router)

For simple schema validation without hooks:

```typescript
// app/api/products/route.ts
import { withSchema, ZodAdapter } from 'next-form-request';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
});

export const POST = withSchema(new ZodAdapter(productSchema), async (data, request) => {
  // data is typed as { name: string; price: number }
  const product = await db.products.create({ data });
  return Response.json({ product }, { status: 201 });
});
```

### withApiSchema (Lightweight Pages Router)

For simple schema validation without hooks:

```typescript
// pages/api/products.ts
import { withApiSchema, ZodAdapter } from 'next-form-request';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
});

export default withApiSchema(new ZodAdapter(productSchema), async (data, req, res) => {
  const product = await db.products.create({ data });
  res.status(201).json({ product });
});
```

### Custom Error Handling

Create wrappers with custom error handlers:

```typescript
import { createAppRouterWrapper, ValidationError, AuthorizationError } from 'next-form-request';

const withValidation = createAppRouterWrapper({
  onValidationError: (error) =>
    Response.json({ errors: error.errors }, { status: 422 }),
  onAuthorizationError: () =>
    Response.json({ message: 'Forbidden' }, { status: 403 }),
  onError: (error) => {
    console.error(error);
    return Response.json({ message: 'Internal Server Error' }, { status: 500 });
  },
});

export const POST = withValidation(CreateUserRequest, async (data) => {
  const user = await db.users.create({ data });
  return Response.json({ user }, { status: 201 });
});
```

## Lifecycle Hooks

FormRequest supports Laravel-style lifecycle hooks for complete control over the validation process.

### authorize()

Control who can make the request:

```typescript
class UpdatePostRequest extends FormRequest<PostData> {
  rules() {
    return new ZodAdapter(schema);
  }

  async authorize() {
    const session = await getSession(this.request);
    const postId = this.param('id');
    const post = await db.posts.findUnique({ where: { id: postId } });

    // Only the author can update the post
    return post?.authorId === session?.user?.id;
  }

  onAuthorizationFailed() {
    console.log('Unauthorised update attempt on post:', this.param('id'));
  }
}
```

### beforeValidation()

Transform input data before validation:

```typescript
class CreateUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(schema);
  }

  beforeValidation() {
    // Normalise email
    if (this.body.email) {
      this.body.email = this.body.email.toLowerCase().trim();
    }

    // Strip whitespace from all string fields
    for (const [key, value] of Object.entries(this.body)) {
      if (typeof value === 'string') {
        this.body[key] = value.trim();
      }
    }
  }
}
```

### afterValidation()

Process data after successful validation:

```typescript
class CreateOrderRequest extends FormRequest<OrderData> {
  rules() {
    return new ZodAdapter(schema);
  }

  async afterValidation(data: OrderData) {
    // Log successful order creation
    await analytics.track('order_validated', {
      userId: data.userId,
      amount: data.total,
    });
  }
}
```

### onValidationFailed()

Handle validation failures:

```typescript
class LoginRequest extends FormRequest<LoginData> {
  rules() {
    return new ZodAdapter(schema);
  }

  async onValidationFailed(errors: ValidationErrors) {
    // Track failed login attempts
    await analytics.track('login_validation_failed', {
      email: this.input('email'),
      errors: Object.keys(errors),
    });
  }
}
```

### rateLimit()

Add rate limiting to protect endpoints:

```typescript
class LoginRequest extends FormRequest<LoginData> {
  rules() {
    return new ZodAdapter(schema);
  }

  rateLimit() {
    return {
      maxAttempts: 5,
      windowMs: 60000, // 1 minute
      key: (req) => this.input('email') || 'anonymous',
      message: 'Too many login attempts. Please try again later.',
    };
  }
}
```

### coercion()

Automatically convert string values to appropriate types:

```typescript
class UpdateSettingsRequest extends FormRequest<SettingsData> {
  rules() {
    return new ZodAdapter(schema);
  }

  coercion() {
    return {
      booleans: true,  // "true" → true
      numbers: true,   // "123" → 123
      dates: true,     // "2024-01-01" → Date
      nulls: true,     // "null" → null
    };
  }
}
```

## Utilities

### File Uploads

Validate file uploads with comprehensive options:

```typescript
import { FormRequest, ZodAdapter, formFile, formFiles } from 'next-form-request';
import { z } from 'zod';

const uploadSchema = z.object({
  // Single file
  avatar: formFile({
    maxSize: '5mb',
    types: ['image/*'],
    extensions: ['jpg', 'png', 'webp'],
  }),

  // Multiple files
  documents: formFiles({
    maxSize: '10mb',
    types: ['application/pdf', 'application/msword'],
    minFiles: 1,
    maxFiles: 5,
  }),
});

export class UploadRequest extends FormRequest<z.infer<typeof uploadSchema>> {
  rules() {
    return new ZodAdapter(uploadSchema);
  }
}

// Usage
const data = await form.validate();
console.log(data.avatar.name);    // "profile.jpg"
console.log(data.avatar.size);    // 245678
console.log(data.avatar.type);    // "image/jpeg"

const buffer = await data.avatar.arrayBuffer();
const text = await data.avatar.text();
```

### Rate Limiting

Protect your API routes from abuse:

```typescript
import { rateLimit, RateLimitError } from 'next-form-request';

class ApiRequest extends FormRequest<RequestData> {
  rules() {
    return new ZodAdapter(schema);
  }

  rateLimit() {
    return rateLimit({
      maxAttempts: 100,
      windowMs: 60000, // 1 minute
      key: async (req) => {
        // Rate limit by API key
        const apiKey = this.header('x-api-key');
        return apiKey || 'anonymous';
      },
    });
  }
}

// Handle rate limit errors
try {
  const data = await form.validate();
} catch (error) {
  if (error instanceof RateLimitError) {
    return Response.json(
      { message: error.message },
      {
        status: 429,
        headers: error.getHeaders(), // X-RateLimit-* headers
      }
    );
  }
}
```

### Type Coercion

Automatically convert form data strings:

```typescript
import { coerceFormData, coercionPresets } from 'next-form-request';

const formData = {
  name: "John",
  age: "25",
  active: "true",
  score: "98.5",
  createdAt: "2024-01-01T12:00:00Z",
};

const coerced = coerceFormData(formData, coercionPresets.standard);
// {
//   name: "John",
//   age: 25,
//   active: true,
//   score: 98.5,
//   createdAt: Date("2024-01-01T12:00:00Z"),
// }
```

Use in FormRequest:

```typescript
class MyRequest extends FormRequest<Data> {
  rules() {
    return new ZodAdapter(schema);
  }

  coercion() {
    return {
      booleans: true,
      numbers: true,
      dates: true,
      fields: {
        // Custom coercion for specific fields
        'metadata': (value) => JSON.parse(value),
      },
    };
  }
}
```

### Error Formatting

Format validation errors for different use cases:

```typescript
import { formatErrors, flattenErrors, summarizeErrors } from 'next-form-request';

const errors = {
  email: ['Email is invalid', 'Email is required'],
  password: ['Password must be at least 8 characters'],
  'address.postcode': ['Postcode is invalid'],
};

// Structured format with metadata
const formatted = formatErrors(errors, {
  includeCount: true,
  includeFields: true,
});
// {
//   errors: { ... },
//   meta: { count: 3, fields: ['email', 'password', 'address.postcode'] }
// }

// Flat array of all messages
const flat = flattenErrors(errors);
// ['Email is invalid', 'Email is required', 'Password must be...', ...]

// Summary string
const summary = summarizeErrors(errors);
// "Email is invalid, Password must be at least 8 characters, Postcode is invalid"
```

### Testing Utilities

Comprehensive utilities for testing form requests:

```typescript
import {
  testFormRequest,
  createMockRequest,
  expectValid,
  expectInvalid,
  expectFieldError,
} from 'next-form-request';

describe('CreateUserRequest', () => {
  it('validates correct data', async () => {
    const result = await testFormRequest(CreateUserRequest, {
      email: 'test@example.com',
      name: 'John Doe',
      password: 'password123',
    });

    expectValid(result);
    expect(result.data.email).toBe('test@example.com');
  });

  it('rejects invalid email', async () => {
    const result = await testFormRequest(CreateUserRequest, {
      email: 'invalid-email',
      name: 'John Doe',
      password: 'password123',
    });

    expectInvalid(result);
    expectFieldError(result, 'email');
  });

  it('tests with custom request', async () => {
    const mockRequest = createMockRequest({
      method: 'POST',
      body: { email: 'test@example.com', name: 'John' },
      headers: { 'x-api-key': 'test-key' },
    });

    const form = await CreateUserRequest.fromAppRouter(mockRequest);
    const data = await form.validate();

    expect(data.email).toBe('test@example.com');
  });
});
```

## Advanced Patterns

### Composition

Create reusable base classes:

```typescript
import { FormRequest, createAuthenticatedRequest } from 'next-form-request';

// Base authenticated request
const AuthenticatedRequest = createAuthenticatedRequest({
  async getUser(request) {
    const session = await getSession(request);
    return session?.user;
  },
});

// Use in your requests
class CreatePostRequest extends AuthenticatedRequest<PostData> {
  rules() {
    return new ZodAdapter(postSchema);
  }

  async authorize() {
    // this.user is available from base class
    return this.user?.role === 'admin';
  }
}
```

### Custom Messages

Override default error messages:

```typescript
class CreateUserRequest extends FormRequest<UserData> {
  rules() {
    return new ZodAdapter(schema);
  }

  messages() {
    return {
      'email.invalid_string': 'Please provide a valid email address',
      'email.required': 'Email is required',
      'password.too_small': 'Password must be at least 8 characters long',
      'name': 'Please provide your full name',
    };
  }

  attributes() {
    return {
      email: 'email address',
      dob: 'date of birth',
      postcode: 'postal code',
    };
  }
}
```

### Helper Methods

Access request data with convenient helpers:

```typescript
const form = await MyRequest.fromAppRouter(request, { id: '123' });

// Input values
form.input('email');                    // Get a value
form.input('missing', 'default');       // With default
form.has('email');                      // Check existence
form.all();                             // Get all body data

// Filtering
form.only('email', 'name');             // Only these keys
form.except('password', 'token');       // All except these

// Request data
form.param('id');                       // Route parameter (from URL)
form.header('content-type');            // Header value
form.getRequest();                      // Original request object
form.isAppRouter();                     // Check router type

// After validation
const data = await form.validate();
form.validated();                       // Get validated data again
form.safe();                            // Get partial validated data
```

### Reusable Base Classes

Create domain-specific base requests:

```typescript
// Base class for all API requests
abstract class ApiRequest<T> extends FormRequest<T> {
  async authorize() {
    const apiKey = this.header('x-api-key');
    return apiKey === process.env.API_KEY;
  }

  rateLimit() {
    return {
      maxAttempts: 100,
      windowMs: 60000,
      key: () => this.header('x-api-key') || 'anonymous',
    };
  }
}

// Use the base class
class CreateWebhookRequest extends ApiRequest<WebhookData> {
  rules() {
    return new ZodAdapter(webhookSchema);
  }

  // authorize() and rateLimit() inherited
}
```

### Conditional Validation

Adjust validation based on request data:

```typescript
class UpdateUserRequest extends FormRequest<UserData> {
  rules() {
    const isAdmin = this.input('role') === 'admin';

    const baseSchema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
    });

    if (isAdmin) {
      return new ZodAdapter(baseSchema.extend({
        permissions: z.array(z.string()),
        department: z.string(),
      }));
    }

    return new ZodAdapter(baseSchema);
  }
}
```

## API Reference

### FormRequest

#### Abstract Methods

| Method | Description |
|--------|-------------|
| `rules()` | **Required.** Return a `ValidatorAdapter` instance for validation |

#### Lifecycle Hooks

| Method | Description |
|--------|-------------|
| `authorize()` | Return `true` to allow request, `false` to reject with 403 |
| `beforeValidation()` | Transform `this.body` before validation runs |
| `afterValidation(data)` | Called after successful validation with typed data |
| `onValidationFailed(errors)` | Called when validation fails |
| `onAuthorizationFailed()` | Called when authorization fails |
| `rateLimit()` | Return rate limit configuration or `null` |
| `coercion()` | Return coercion options or `null` |

#### Customisation

| Method | Description |
|--------|-------------|
| `messages()` | Return custom error messages as `Record<string, string>` |
| `attributes()` | Return custom field names for error messages |

#### Static Factory Methods

| Method | Description |
|--------|-------------|
| `fromAppRouter(request, params?)` | Create instance from App Router `Request` |
| `fromPagesRouter(request, params?)` | Create instance from Pages Router `NextApiRequest` |

#### Instance Methods

| Method | Description |
|--------|-------------|
| `validate()` | Run validation and return typed data (throws on failure) |
| `validated()` | Get validated data (must call `validate()` first) |
| `safe()` | Get partial validated data (safe to call any time) |
| `all()` | Get all input data as object |
| `input(key, default?)` | Get input value with optional default |
| `has(key)` | Check if input key exists |
| `only(...keys)` | Get only specified keys from input |
| `except(...keys)` | Get all input except specified keys |
| `param(name)` | Get route parameter value |
| `header(name)` | Get request header value |
| `getRequest()` | Get original request object |
| `isAppRouter()` | Check if App Router request |

### Wrapper Functions

#### App Router

| Function | Description |
|----------|-------------|
| `withRequest(RequestClass, handler)` | Wrap route handler with full FormRequest |
| `withSchema(adapter, handler)` | Wrap route handler with schema validation only |
| `createAppRouterWrapper(options)` | Create custom wrapper with error handlers |

#### Pages Router

| Function | Description |
|----------|-------------|
| `withApiRequest(RequestClass, handler)` | Wrap API handler with full FormRequest |
| `withApiSchema(adapter, handler)` | Wrap API handler with schema validation only |
| `createPagesRouterWrapper(options)` | Create custom wrapper with error handlers |

### Error Classes

| Class | Description |
|-------|-------------|
| `ValidationError` | Thrown when validation fails. Has `.errors` property |
| `AuthorizationError` | Thrown when `authorize()` returns `false` |
| `RateLimitError` | Thrown when rate limit exceeded. Has `.getHeaders()` method |

### Utilities

| Export | Description |
|--------|-------------|
| `formFile(options)` | Create Zod schema for single file upload |
| `formFiles(options)` | Create Zod schema for multiple file uploads |
| `coerceFormData(data, options)` | Coerce string values to appropriate types |
| `formatErrors(errors, options)` | Format validation errors with metadata |
| `testFormRequest(RequestClass, data)` | Test helper for form requests |

## TypeScript Support

The library provides full TypeScript support with automatic type inference:

```typescript
const schema = z.object({
  email: z.string().email(),
  age: z.number(),
  role: z.enum(['user', 'admin']),
});

class MyRequest extends FormRequest<z.infer<typeof schema>> {
  rules() {
    return new ZodAdapter(schema);
  }
}

// In your route
export const POST = withRequest(MyRequest, async (data) => {
  // data is typed as { email: string; age: number; role: 'user' | 'admin' }
  data.email;  // ✓ string
  data.age;    // ✓ number
  data.role;   // ✓ 'user' | 'admin'
  data.foo;    // ✗ TypeScript error

  return Response.json({ data });
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © [Sam Street](https://github.com/samstreet/next-request)
